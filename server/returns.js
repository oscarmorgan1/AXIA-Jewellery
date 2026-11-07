// Returns: pieces from a shipped order coming back.
//
// returns/{id} is read by admins (firestore.rules) and written only here, with
// the Admin SDK. A return belongs to one order and lists the units coming back:
// each is an order line, and the registry piece (serial) when it has one.
//
// While a return is open the order's status is `in_return` (orders/{id}.returnId
// points at it) and each piece in it carries `returnId`, so a piece is never in
// two returns or transferred mid-return. The tracker:
//
// Every return has an end goal, its `outcome`: a refund, or an exchange for
// another size or piece (`exchange.wanted`). The tracker follows it:
//
//   refund:   requested → label_created → received → refunded → closed (order cancelled)
//   exchange: requested → label_created → received → replacement_sent → closed (exchanged)
//
//   requested      started by the customer (portal) or the team (admin)
//   label_created  the prepaid return label is made (carrier, tracking, label link)
//   received       the parcel is back
//   refunded       refund: the money has gone back (refunded in Stripe from here, or marked as done)
//   replacement_sent  exchange: the replacement is on its way (tracking, and the registry
//                  piece it is, which joins the order line in place of the returned one)
//   closed         finished. A full return cancels the order (the status it has today);
//                  a partial one, or any exchange, puts the order back where it was. Returned pieces
//                  leave the order and go back into stock in the registry.
//   declined / withdrawn   ended early (by the team, or by the customer while it's
//                  still a request); the order goes back to where it was.
//
// The buyer's copy is accounts/{uid}/returns/{id} (syncReturn in server/sync.js).
//
//   Admin (mounted in server/admin.js, behind requireAdmin):
//   POST /api/admin/returns                  {orderId, items: [{line, key}], outcome, wanted, reason, note, label?, notify}
//   POST /api/admin/returns/:id/step         {to, label?, refund?: {amountAUD, stripe}, replacement?: {carrier, number, url, keys}, note, notify}
//   POST /api/admin/returns/:id/outcome      {outcome, wanted}  switch refund ⇄ exchange before anything is refunded or sent
//   Customer:
//   POST /api/account/returns                {key, outcome, wanted, reason, note}  start a return for one of their pieces
//   POST /api/account/returns/:id/withdraw   while it's still a request
import express from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, stripe } from './services.js';
import { customerId, emailEntry, historyEntry, push } from './orders.js';
import { syncOrder, syncPiece, syncReturn } from './sync.js';
import { returnEmail, returnAlertEmail, sendEmail, brandUrl } from './email.js';
import { alertTeam, sydneyDay } from './forms.js';
import { requireCustomer } from './account.js';
import { rateLimit } from './limit.js';

export const RETURN_REASONS = {
  fit: 'It doesn’t fit',
  mind: 'Changed my mind',
  faulty: 'Faulty or damaged',
  other: 'Something else',
};
/** Order statuses a return can start from. */
export const RETURNABLE = ['shipped', 'fulfilled'];
export const OUTCOMES = ['refund', 'exchange'];
export const OPEN_RETURN = ['requested', 'label_created', 'received', 'refunded', 'replacement_sent'];
/** Where each step can go next (admin), for each end goal. */
export const NEXT = {
  refund: {
    requested: ['label_created', 'received', 'declined'],
    label_created: ['label_created', 'received', 'declined'],
    received: ['refunded'],
    refunded: ['closed'],
  },
  exchange: {
    requested: ['label_created', 'received', 'declined'],
    label_created: ['label_created', 'received', 'declined'],
    received: ['replacement_sent'],
    replacement_sent: ['replacement_sent', 'closed'],
  },
};
/** Customers can start a return for this many days after the piece shipped. */
export const RETURN_DAYS = 30;
const outcomeOf = r => (r && r.outcome === 'exchange' ? 'exchange' : 'refund');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const site = () => process.env.PUBLIC_SITE_URL || brandUrl();
const orderNo = (o, id) => o.orderNumber || id.slice(-6).toUpperCase();
const cents = n => Math.round(Number(n) * 100);

function cleanLabel(l) {
  if (!l || typeof l !== 'object') return null;
  const out = { carrier: str(l.carrier, 60), number: str(l.number, 80), url: /^https:\/\//.test(str(l.url, 500)) ? str(l.url, 500) : '' };
  return out.number || out.url ? out : null;
}

/** Units per order line already returned in earlier, closed returns. */
const returnedOn = (o, line) => Number((o.returnedQty || {})[String(line)]) || 0;
const totalQty = o => (o.items || []).reduce((a, i) => a + (Number(i.qty) || 1), 0);

/**
 * Opens a return on an order. `picks` are the units coming back: {line, key}
 * with key the registry piece's key, or null for a unit without a serial.
 * One open return per order at a time. Returns { id, ret }.
 */
export async function openReturn({ orderId, picks, outcome, wanted, reason, note, customerNote, label, source, by, uid }) {
  const orderRef = db.collection('orders').doc(orderId);
  const retRef = db.collection('returns').doc();
  const ret = await db.runTransaction(async tx => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) throw new HttpError(404, 'Order not found');
    const o = snap.data();
    if (o.status === 'in_return') throw new HttpError(409, 'This order already has a return open. Finish or decline it first.');
    if (!RETURNABLE.includes(o.status)) throw new HttpError(400, 'Only orders that have shipped can be returned. Cancel it instead.');
    if (!Array.isArray(picks) || !picks.length) throw new HttpError(400, 'Pick what’s coming back.');
    if (picks.length > 50) throw new HttpError(400, 'That’s too many pieces for one return.');

    const items = [];
    const perLine = new Map();
    const keys = new Set();
    const pieceRefs = [];
    for (const pick of picks) {
      const line = Number(pick && pick.line);
      const item = Number.isInteger(line) ? (o.items || [])[line] : null;
      if (!item) throw new HttpError(400, 'That item isn’t on this order.');
      const key = str(pick.key, 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
      let serial = '';
      let variant = [item.width, item.length, item.colour].filter(Boolean).join(' · ');
      if (key) {
        if (keys.has(key)) throw new HttpError(400, 'A piece is in the list twice.');
        keys.add(key);
        const pref = db.collection('pieces').doc(key);
        const p = await tx.get(pref);
        if (!p.exists || p.get('orderId') !== orderId || p.get('orderLine') !== line) throw new HttpError(400, `Piece ${key} isn’t on that line of this order.`);
        if (p.get('returnId')) throw new HttpError(409, `${p.get('serial')} is already in a return.`);
        if (p.get('transfer.id')) throw new HttpError(409, `${p.get('serial')} has a transfer waiting. Cancel the transfer first.`);
        serial = p.get('serial') || key;
        variant = p.get('variant') || variant;
        pieceRefs.push(pref);
      }
      const n = (perLine.get(line) || 0) + 1;
      perLine.set(line, n);
      if (n + returnedOn(o, line) > (Number(item.qty) || 1)) throw new HttpError(400, `More of ${item.name} than were ordered.`);
      items.push({ line, key: key || null, serial, productId: item.id || '', productName: item.name || '', variant, engraving: item.engraving || '' });
    }
    const already = Object.values(o.returnedQty || {}).reduce((a, n) => a + (Number(n) || 0), 0);
    const full = items.length + already >= totalQty(o);
    const number = `R-${orderNo(o, orderId)}-${(o.returnIds || []).length + 1}`;
    const history = [historyEntry('requested', by, { ...(source === 'portal' ? { source } : {}) })];
    if (label) history.push(historyEntry('label_created', by));
    const doc = {
      number, orderId, orderNumber: orderNo(o, orderId),
      customer: { name: (o.customer && o.customer.name) || '', email: (o.customer && o.customer.email) || '' },
      customerEmail: customerId(o.customer && o.customer.email),
      items, full, outcome: outcome === 'exchange' ? 'exchange' : 'refund',
      exchange: outcome === 'exchange' ? { wanted: wanted || '' } : null, replacement: null,
      reason: reason || 'Something else', customerNote: customerNote || '', notes: note || '',
      status: label ? 'label_created' : 'requested', source, ...(uid ? { uid } : {}),
      orderStatusBefore: o.status, label: label || null, refund: null,
      history, emails: [], createdBy: by,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(retRef, doc);
    tx.update(orderRef, {
      status: 'in_return', returnId: retRef.id, returnIds: FieldValue.arrayUnion(retRef.id), updatedAt: FieldValue.serverTimestamp(),
      statusHistory: push(historyEntry('in_return', by, { returnId: retRef.id })),
    });
    pieceRefs.forEach(r => tx.update(r, { returnId: retRef.id, updatedAt: FieldValue.serverTimestamp() }));
    return doc;
  });
  return { id: retRef.id, ret };
}

/** Emails the customer about a return step and logs it on the return. Never throws. */
async function tellCustomer(id, ret, kind, note) {
  const to = customerId(ret.customer && ret.customer.email);
  if (!to) return null;
  try {
    const mail = returnEmail(ret, kind, site(), { note });
    const sent = await sendEmail({ to, ...mail, idempotencyKey: `return/${id}/${kind}/${Math.floor(Date.now() / 10000)}` });
    const entry = emailEntry(`return:${kind}`, to, mail.subject, sent);
    await db.collection('returns').doc(id).update({ emails: push(entry) });
    return entry;
  } catch (err) {
    console.error('returns: customer email failed', id, kind, err);
    return null;
  }
}

/** Ends a return: closed (finished), declined (by the team) or withdrawn (by the customer). */
async function finish(id, to, by, note, emailed = false) {
  const ref = db.collection('returns').doc(id);
  const day = sydneyDay();
  const out = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, 'Return not found');
    const r = snap.data();
    if (!OPEN_RETURN.includes(r.status)) throw new HttpError(409, 'This return is already finished.');
    const orderRef = db.collection('orders').doc(r.orderId);
    const order = await tx.get(orderRef);
    const keys = (r.items || []).map(i => i.key).filter(Boolean);
    const pieces = await Promise.all(keys.map(k => tx.get(db.collection('pieces').doc(k))));

    tx.update(ref, {
      status: to, updatedAt: FieldValue.serverTimestamp(), closedAt: FieldValue.serverTimestamp(),
      history: push(historyEntry(to, by, note ? { note, emailed } : {})),
    });
    if (order.exists && order.get('returnId') === id) {
      const o = order.data();
      // A refund of everything cancels the order; anything else (part of it, or an exchange) puts it back.
      const back = to === 'closed' && r.full && outcomeOf(r) === 'refund' ? 'cancelled' : r.orderStatusBefore || 'fulfilled';
      const update = { status: back, returnId: null, updatedAt: FieldValue.serverTimestamp(),
        statusHistory: push(historyEntry(back, by, { returnId: id, ...(to === 'closed' ? {} : { note: `Return ${r.number} ${to}` }) })) };
      if (to === 'closed' && outcomeOf(r) === 'refund') {
        const qty = { ...(o.returnedQty || {}) };
        for (const i of r.items || []) qty[String(i.line)] = (Number(qty[String(i.line)]) || 0) + 1;
        update.returnedQty = qty;
      }
      tx.update(orderRef, update);
    }
    for (const p of pieces) {
      if (!p.exists || p.get('returnId') !== id) continue;
      tx.update(p.ref, to === 'closed' ? {
        // Back in stock: off the order, so its owner's portal copy goes and /genuine stops answering for it.
        returnId: null, orderId: null, orderNumber: null, orderLine: null, shippedOn: null,
        ownerUid: null, ownerEmail: null, transfer: null, returnedOn: day,
        returns: FieldValue.arrayUnion({ returnId: id, number: r.number, orderId: r.orderId, orderNumber: r.orderNumber, on: day }),
        updatedAt: FieldValue.serverTimestamp(),
      } : { returnId: null, updatedAt: FieldValue.serverTimestamp() });
    }
    return { r: { ...r, status: to }, keys };
  });
  await syncReturn(id);
  await syncOrder(out.r.orderId); // order copy, and pieces still on it
  await Promise.all(out.keys.map(k => syncPiece(k))); // returned pieces leave the owner's Pieces
  return out.r;
}

/**
 * Puts registry pieces in place of the returned ones on the order: `keys[i]` is
 * the replacement for the return's item i (empty for none, e.g. no serial yet).
 * Each must be in stock: received, on no order, in no return. They go out today.
 */
async function placeReplacements(id, r, keys, by) {
  const day = sydneyDay();
  const wanted = (r.items || []).map((item, i) => ({ item, key: str(keys[i], 40).toUpperCase().replace(/[^A-Z0-9]/g, '') })).filter(x => x.key);
  if (new Set(wanted.map(x => x.key)).size !== wanted.length) throw new HttpError(400, 'A replacement piece is picked twice.');
  // Pieces sent earlier for this return that aren't in the new pick go back to stock.
  const dropped = ((r.replacement && r.replacement.pieces) || []).map(x => x.key).filter(k => k && !wanted.some(x => x.key === k));
  return db.runTransaction(async tx => {
    const snaps = await Promise.all(wanted.map(x => tx.get(db.collection('pieces').doc(x.key))));
    const old = await Promise.all(dropped.map(k => tx.get(db.collection('pieces').doc(k))));
    old.filter(p => p.exists && p.get('replacesReturnId') === id && p.get('orderId') === r.orderId).forEach(p => tx.update(p.ref, {
      orderId: null, orderNumber: null, orderLine: null, shippedOn: null, replacesReturnId: FieldValue.delete(), replaces: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(),
    }));
    const out = [];
    snaps.forEach((p, n) => {
      const { item, key } = wanted[n];
      if (!p.exists) throw new HttpError(400, `${key} isn’t in the registry.`);
      const already = p.get('orderId') === r.orderId && p.get('replacesReturnId') === id;
      if (!already && (p.get('orderId') || p.get('returnId'))) throw new HttpError(409, `${p.get('serial')} is already on an order.`);
      if (p.get('receivedOn') === null) throw new HttpError(400, `${p.get('serial')} is still with the maker.`);
      tx.update(p.ref, {
        orderId: r.orderId, orderNumber: r.orderNumber, orderLine: item.line, shippedOn: day, replacesReturnId: id,
        ...(item.key ? { replaces: item.key } : {}), updatedAt: FieldValue.serverTimestamp(),
      });
      out.push({ key, serial: p.get('serial') || key, productName: p.get('productName') || '', variant: p.get('variant') || '', line: item.line, replaces: item.key || null });
    });
    return out;
  });
}

/** Switches a return between refund and exchange, before any money or replacement has gone out. */
async function setOutcome(req) {
  const id = str(req.params.id, 100);
  const ref = db.collection('returns').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Return not found');
  const r = snap.data();
  if (!['requested', 'label_created', 'received'].includes(r.status)) throw new HttpError(409, 'The refund or replacement has already gone out, so this can’t change now.');
  const outcome = OUTCOMES.includes(req.body.outcome) ? req.body.outcome : null;
  if (!outcome) throw new HttpError(400, 'Choose refund or exchange.');
  const wanted = str(req.body.wanted, 300);
  const by = req.admin.email || req.admin.uid;
  await ref.update({
    outcome, exchange: outcome === 'exchange' ? { wanted } : null, updatedAt: FieldValue.serverTimestamp(),
    history: push(historyEntry(r.status, by, { outcome, note: outcome === 'exchange' ? `Changed to an exchange${wanted ? `: ${wanted}` : ''}` : 'Changed to a refund' })),
  });
  await syncReturn(id);
  return { outcome };
}

/** Moves a return to its next step (admin). */
async function step(req) {
  const id = str(req.params.id, 100);
  const ref = db.collection('returns').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Return not found');
  const r = snap.data();
  const to = str(req.body.to, 30);
  const by = req.admin.email || req.admin.uid;
  const note = str(req.body.note, 1000);
  if (!((NEXT[outcomeOf(r)] || {})[r.status] || []).includes(to)) {
    throw new HttpError(400, r.status === to ? 'It’s already at that step.' : 'That step doesn’t follow from where this return is.');
  }
  const notify = req.body.notify !== false;

  if (to === 'declined' || to === 'closed') {
    if (to === 'declined' && !note) throw new HttpError(400, 'Add a note saying why. It’s emailed to the customer.');
    const done = await finish(id, to, by, note, notify);
    const kind = to === 'closed' && outcomeOf(done) === 'exchange' ? 'exchanged' : to;
    const email = notify ? await tellCustomer(id, done, kind, note) : null;
    return { status: to, email: email && { resendId: email.resendId, status: email.status } };
  }

  const update = { status: to, updatedAt: FieldValue.serverTimestamp() };
  const extra = {};
  if (to === 'label_created') {
    const label = cleanLabel(req.body.label);
    if (!label) throw new HttpError(400, 'Add the return label’s tracking number or link.');
    update.label = label;
    if (r.status === 'label_created') extra.updated = true;
  }
  let stripeRefund = null;
  if (to === 'refunded') {
    const amount = Math.round(Number(req.body.refund && req.body.refund.amountAUD) * 100) / 100;
    if (!(amount > 0)) throw new HttpError(400, 'Enter the amount refunded.');
    const order = await db.collection('orders').doc(r.orderId).get();
    const o = order.exists ? order.data() : {};
    // Refunded so far: what Stripe reports (webhook), or what returns have recorded, whichever is more.
    const refunded = Math.max(Number(o.stripe && o.stripe.refundedAUD) || 0, Number(o.returnsRefundedAUD) || 0);
    const left = Math.round(((Number(o.totalAUD) || 0) - refunded) * 100) / 100;
    if (amount > left + 0.001) throw new HttpError(400, `That’s more than is left to refund on this order (A$${left.toFixed(2)}).`);
    if (req.body.refund && req.body.refund.stripe === true) {
      if (!stripe) throw new HttpError(503, 'Stripe is not configured');
      const pi = o.stripe && o.stripe.paymentIntent;
      if (!pi) throw new HttpError(400, 'This order has no Stripe payment to refund.');
      // Keyed by return: a double click or retry never refunds twice.
      stripeRefund = await stripe.refunds.create({
        payment_intent: pi, amount: cents(amount), reason: 'requested_by_customer',
        metadata: { returnId: id, returnNumber: r.number, orderId: r.orderId },
      }, { idempotencyKey: `return-refund/${id}` });
    }
    await order.ref.update({ returnsRefundedAUD: FieldValue.increment(amount), updatedAt: FieldValue.serverTimestamp() });
    update.refund = { amountAUD: amount, via: stripeRefund ? 'stripe' : 'manual', ...(stripeRefund ? { stripeRefundId: stripeRefund.id } : {}), at: Timestamp.now(), by };
  }
  let linked = [];
  if (to === 'replacement_sent') {
    const t = cleanLabel(req.body.replacement);
    if (!t) throw new HttpError(400, 'Add the replacement’s tracking number or link.');
    const keys = Array.isArray(req.body.replacement && req.body.replacement.keys) ? req.body.replacement.keys : [];
    const pieces = await placeReplacements(id, r, keys, by);
    linked = [...new Set([...pieces, ...((r.replacement && r.replacement.pieces) || [])].map(p => p.key).filter(Boolean))]; // earlier picks leave their Pieces
    update.replacement = { ...t, pieces, at: Timestamp.now(), by };
    if (r.status === 'replacement_sent') extra.updated = true;
  }
  const fresh = { ...r, ...update, status: to };
  // Emailed first, so the step's history says whether its note reached them (their tracker shows only those).
  const email = notify ? await tellCustomer(id, fresh, to, note) : null;
  update.history = push(historyEntry(to, by, { ...(note ? { note } : {}), ...extra, emailed: !!(email && email.resendId) }));
  await ref.update(update);
  await syncReturn(id);
  await Promise.all(linked.map(k => syncPiece(k))); // the replacement shows in their Pieces
  return { status: to, refund: stripeRefund ? { id: stripeRefund.id, status: stripeRefund.status } : null, email: email && { resendId: email.resendId, status: email.status } };
}

/** POST /api/admin/returns: the team opens a return on a shipped order. */
async function create(req) {
  const b = req.body || {};
  const orderId = str(b.orderId, 300);
  const reason = RETURN_REASONS[b.reason] || str(b.reason, 60) || RETURN_REASONS.other;
  const label = cleanLabel(b.label);
  const outcome = b.outcome === 'exchange' ? 'exchange' : 'refund';
  const { id, ret } = await openReturn({
    orderId, picks: b.items, outcome, wanted: str(b.wanted, 300), reason, note: str(b.note, 2000), customerNote: '', label, source: 'admin', by: req.admin.email || req.admin.uid,
  });
  await syncReturn(id);
  await syncOrder(orderId);
  const email = b.notify !== false ? await tellCustomer(id, ret, label ? 'label_created' : 'opened') : null;
  return { id, number: ret.number, email: email && { resendId: email.resendId, status: email.status } };
}

/** Admin routes, mounted by server/admin.js after its admin check. */
export function adminReturnRoutes(handle) {
  const router = express.Router();
  router.post('/api/admin/returns', handle(create));
  router.post('/api/admin/returns/:id/step', handle(step));
  router.post('/api/admin/returns/:id/outcome', handle(setOutcome));
  return router;
}

// ---- Customer side

/** Whether a piece that shipped on `shippedOn` (YYYY-MM-DD, Sydney) is still inside the return window. */
export function returnWindowOpen(shippedOn, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shippedOn || '')) return false;
  const [y, m, d] = shippedOn.split('-').map(Number);
  // The window closes at the end of the RETURN_DAYS-th day after shipping (Sydney, UTC+10 at the latest).
  return now < Date.UTC(y, m - 1, d + RETURN_DAYS + 1) - 10 * 60 * 60 * 1000;
}

const handleAccount = fn => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    res.json(await fn(req));
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(`returns: ${req.method} ${req.path} failed`, err);
    res.status(500).json({ error: 'Something went wrong. Please try again in a moment.' });
  }
};

export function returnRoutes() {
  const router = express.Router();
  const tooMany = rateLimit({ windowMs: 10 * 60 * 1000, max: 6 });
  router.use('/api/account/returns', express.json({ limit: '8kb' }), requireCustomer);

  router.post('/api/account/returns', handleAccount(async req => {
    const { uid, email } = req.customer;
    if (tooMany(uid)) throw new HttpError(429, 'That’s a lot of requests at once. Please wait a few minutes.');
    const b = req.body || {};
    const key = str(b.key, 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const reasonKey = Object.hasOwn(RETURN_REASONS, b.reason) ? b.reason : '';
    if (!reasonKey) throw new HttpError(400, 'Choose a reason for the return.');
    const customerNote = str(b.note, 2000);
    if (reasonKey === 'faulty' && customerNote.length < 4) throw new HttpError(400, 'Tell us what’s wrong with it, so we can look after you.');
    const outcome = OUTCOMES.includes(b.outcome) ? b.outcome : '';
    if (!outcome) throw new HttpError(400, 'Choose whether you’d like a refund or an exchange.');
    const wanted = str(b.wanted, 300);
    if (outcome === 'exchange' && wanted.length < 2) throw new HttpError(400, 'Tell us what you’d like instead, for example the size.');

    // Theirs: their portal copy, from their own order (a piece passed on to them has no order there).
    const mine = key ? await db.collection('accounts').doc(uid).collection('pieces').doc(key).get() : null;
    if (!mine || !mine.exists) throw new HttpError(404, 'Piece not found');
    if (!mine.get('orderId')) throw new HttpError(400, 'This piece was transferred to you, so it can’t be returned from here. Message us and we’ll help.');
    const piece = await db.collection('pieces').doc(key).get();
    if (!piece.exists || piece.get('portalUid') !== uid || piece.get('orderId') !== mine.get('orderId')) throw new HttpError(404, 'Piece not found');
    if (piece.get('returnId')) throw new HttpError(409, 'This piece already has a return open.');
    if (!piece.get('shippedOn')) throw new HttpError(400, 'You can start a return once the piece has been delivered.');
    const order = await db.collection('orders').doc(piece.get('orderId')).get();
    if (!order.exists) throw new HttpError(404, 'Order not found');
    const o = order.data();
    if (o.status === 'in_return') throw new HttpError(409, 'There’s already a return open on this order. Message us to add this piece to it.');
    const line = piece.get('orderLine');
    const item = (o.items || [])[line] || {};
    // The published policy (support page, terms): engraved pieces only if faulty, change of mind within 30 days.
    if (item.engraving && reasonKey !== 'faulty') throw new HttpError(400, 'Engraved pieces can only be returned if they’re faulty. If something’s wrong with it, choose “Faulty or damaged”.');
    // Open for RETURN_DAYS from the day it shipped; after that the portal no longer offers it.
    if (!returnWindowOpen(piece.get('shippedOn'))) {
      throw new HttpError(400, `It’s been more than ${RETURN_DAYS} days since this piece shipped, so it can’t be returned from here. If something’s wrong with it, message us and we’ll look after you under warranty.`);
    }

    const { id, ret } = await openReturn({
      orderId: order.id, picks: [{ line, key }], outcome, wanted, reason: RETURN_REASONS[reasonKey], customerNote, source: 'portal', by: email, uid,
    });
    await syncReturn(id, { uid });
    await syncOrder(order.id);
    await tellCustomer(id, ret, 'requested');
    alertTeam({ email }, id, `return-alert/${id}`, returnAlertEmail({
      id, name: ret.customer.name, email, number: ret.number, orderNumber: ret.orderNumber, items: ret.items, reason: ret.reason, note: customerNote, outcome, wanted,
    })).catch(err => console.error('returns: team alert failed', id, err));
    return { id, number: ret.number, orderId: order.id };
  }));

  router.post('/api/account/returns/:id/withdraw', handleAccount(async req => {
    const id = str(req.params.id, 100);
    const mine = id ? await db.collection('accounts').doc(req.customer.uid).collection('returns').doc(id).get() : null;
    if (!mine || !mine.exists) throw new HttpError(404, 'Return not found');
    const snap = await db.collection('returns').doc(id).get();
    if (!snap.exists) throw new HttpError(404, 'Return not found');
    if (snap.get('status') !== 'requested') throw new HttpError(409, 'Your return label has already been made. Message us if you’d like to keep the piece.');
    await finish(id, 'withdrawn', req.customer.email, 'Withdrawn by the customer');
    return { ok: true };
  }));

  return router;
}
