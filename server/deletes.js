// Deleting things from the admin portal, with everything that points at them.
//
// Each delete runs here, through the Admin SDK, behind the same admin + emailed
// code check as the rest of /api/admin (server/admin.js), so a browser can't do
// half of one and leave references behind.
//
//   deletePromo     a promo code no order has used. Turned off in Stripe (Stripe
//                   doesn't let promotion codes be deleted) and removed here.
//   deleteSupplier  a supplier no registry piece names.
//   deleteOrder     one order and every reference to it: the customer's portal
//                   copy, the customer record's order list and email log, unused
//                   claim links made for it, support conversations that name it,
//                   and registry pieces assigned to it (unassigned, not deleted:
//                   the physical piece still exists). Mainly for test orders.
//   eraseCustomer   everything tied to one email, for privacy requests: their
//                   orders (as above), portal account and sign-in, support
//                   messages, waitlist sign-ups, claim links, piece transfers,
//                   their name in piece ownership history, and their Resend contact.
//
// Stripe is left alone: payments, customers and coupons stay there (refund or
// delete them in the Stripe dashboard). So a re-sent Stripe webhook can't bring
// a deleted order back, `deletedOrders/{id}` remembers the order id (no personal
// data) and server/webhook.js skips it. `erasures/{auto}` logs that an erasure
// happened, when and by whom, with counts but not whose it was.
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, stripe, resend } from './services.js';
import { customerId } from './orders.js';
import { syncPiece, syncThread, ERASED_OWNER } from './sync.js';
import { closeTransfer } from './transfers.js';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

const orderNo = (id, o) => o.orderNumber || id.slice(-6).toUpperCase();
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Firestore `in` takes 30 values at most. */
async function whereIn(col, field, values) {
  const out = [];
  const list = [...new Set(values.filter(Boolean))];
  for (let i = 0; i < list.length; i += 30) out.push(...(await db.collection(col).where(field, 'in', list.slice(i, i + 30)).get()).docs);
  return out;
}

const uniqueDocs = docs => [...new Map(docs.map(d => [d.ref.path, d])).values()];

// ---- Promo codes ----------------------------------------------------------

/**
 * Orders that used a promo code, paid or not: by any Stripe code it has had
 * (editing can replace it, server/admin.js editPromo) or any text it has had.
 */
async function promoOrders(ids, codes) {
  const [byId, byCode] = await Promise.all([
    db.collection('orders').where('promotionCodeId', 'in', ids.slice(0, 30)).select('orderNumber').limit(5).get(),
    codes.length ? db.collection('orders').where('promotionCode', 'in', codes.slice(0, 30)).select('orderNumber').limit(5).get() : null,
  ]);
  return uniqueDocs([...byId.docs, ...((byCode && byCode.docs) || [])]);
}

export async function deletePromo(id) {
  const ref = db.collection('promoCodes').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Code not found');
  const p = snap.data();
  const stripeIds = [...new Set([id, p.stripe && p.stripe.promotionCodeId, ...((p.stripe && p.stripe.previousPromotionCodeIds) || [])].filter(Boolean))];
  const used = await promoOrders(stripeIds, [...new Set([p.code, ...(p.previousCodes || [])].filter(Boolean))]);
  if (used.length) {
    const nos = used.slice(0, 3).map(d => `#${orderNo(d.id, d.data())}`).join(', ');
    throw new HttpError(409, `${p.code} can’t be deleted: it’s on ${used.length >= 5 ? '5 or more orders' : plural(used.length, 'order')} (${nos}). Turn it off instead, so its sales stay counted.`);
  }
  const promoId = p.stripe && p.stripe.promotionCodeId;
  if (promoId) {
    if (!stripe) throw new HttpError(503, 'Stripe is not configured, so the code can’t be turned off there');
    try {
      const live = await stripe.promotionCodes.retrieve(promoId);
      const times = (live.times_redeemed || 0) + (p.redeemedBefore || 0);
      if (times > 0) {
        throw new HttpError(409, `${p.code} can’t be deleted: Stripe says it has been used ${plural(times, 'time')}. Turn it off instead.`);
      }
      // Promotion codes can't be deleted in Stripe; turned off, it stops working at checkout.
      if (live.active) await stripe.promotionCodes.update(promoId, { active: false });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (!(err && err.code === 'resource_missing')) throw err; // already gone from Stripe: fine
    }
  }
  await ref.delete();
  return { ok: true, code: p.code };
}

// ---- Suppliers ------------------------------------------------------------

export async function deleteSupplier(id) {
  const ref = db.collection('suppliers').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Supplier not found');
  const pieces = await db.collection('pieces').where('supplierId', '==', id).select('serial').limit(6).get();
  if (!pieces.empty) {
    const serials = pieces.docs.slice(0, 3).map(d => d.get('serial') || d.id).join(', ');
    const n = pieces.size > 5 ? 'more than 5 pieces' : plural(pieces.size, 'piece');
    throw new HttpError(409, `${snap.get('name') || 'This supplier'} can’t be deleted: ${n} in the registry came from them (${serials}). Change those pieces to another supplier first.`);
  }
  await ref.delete();
  return { ok: true, name: snap.get('name') || '' };
}

// ---- Orders ---------------------------------------------------------------

/** Frees a registry piece from its order: no order, not shipped, no owner, no open transfer. */
async function unassignPiece(doc) {
  const t = doc.get('transfer');
  if (t && t.id) await closeTransfer(t.id, 'cancelled', { cancelledBy: 'admin' });
  await doc.ref.update({
    orderId: null, orderNumber: null, orderLine: null, shippedOn: null, transfer: null,
    ownerUid: FieldValue.delete(), ownerEmail: FieldValue.delete(), ownerOrderId: FieldValue.delete(),
    transferredOn: FieldValue.delete(), owners: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await syncPiece(doc.id); // takes the piece out of whoever's portal it was in
}

/**
 * Deletes one order and every reference to it. `keepCustomer` skips the
 * customer record (eraseCustomer deletes it anyway).
 */
async function cascadeOrder(id, { by, keepCustomer = false } = {}) {
  const ref = db.collection('orders').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const o = snap.data();
  const email = customerId((o.customer && o.customer.email) || o.customerId);
  const done = { pieces: 0, messages: 0, invites: 0, returns: 0 };

  // Registry pieces: unassigned, kept.
  const pieces = await db.collection('pieces').where('orderId', '==', id).get();
  for (const d of pieces.docs) await unassignPiece(d);
  done.pieces = pieces.size;

  // Support conversations about it: kept, without the order.
  const messages = await db.collection('messages').where('orderId', '==', id).get();
  for (const d of messages.docs) {
    await d.ref.update({ orderId: null, order: '' });
    await syncThread(d.id);
  }
  done.messages = messages.size;

  // Claim-your-account links made for this order that nobody used.
  const invites = await db.collection('accountInvites').where('orderId', '==', id).get();
  const unused = invites.docs.filter(d => !d.get('usedAt'));
  await Promise.all(unused.map(d => d.ref.delete()));
  done.invites = unused.length;

  // The customer's portal copy. Owner from the customer record, or their sign-in.
  const uids = new Set();
  if (email && !email.includes('/')) {
    const cust = await db.collection('customers').doc(email).get();
    if (cust.exists && typeof cust.get('uid') === 'string' && cust.get('uid')) uids.add(cust.get('uid'));
    try { uids.add((await getAuth().getUserByEmail(email)).uid); } catch { /* no account */ }
  }
  await Promise.all([...uids].map(uid => db.collection('accounts').doc(uid).collection('orders').doc(id).delete()));

  // Returns of this order (server/returns.js) and the buyer's copies of them.
  const returns = await db.collection('returns').where('orderId', '==', id).get();
  for (const d of returns.docs) {
    await Promise.all([...uids].map(uid => db.collection('accounts').doc(uid).collection('returns').doc(d.id).delete()));
    await d.ref.delete();
  }
  // Pieces still marked as coming back on one of those returns.
  if (returns.size) {
    const ids = new Set(returns.docs.map(d => d.id));
    const back = await db.collection('pieces').where('returnId', 'in', [...ids].slice(0, 30)).get();
    await Promise.all(back.docs.map(d => d.ref.update({ returnId: null, updatedAt: FieldValue.serverTimestamp() })));
  }
  done.returns = returns.size;

  // Pieces that came back from this order keep a `returns` history entry naming it
  // (and who owned them): those entries go too.
  const histories = await db.collection('pieces').where('returns', '!=', null).get();
  for (const d of histories.docs) {
    const list = d.get('returns');
    if (!Array.isArray(list) || !list.some(e => e && e.orderId === id)) continue;
    await d.ref.update({ returns: list.filter(e => !(e && e.orderId === id)), updatedAt: FieldValue.serverTimestamp() });
  }

  // The customer record: drop the order, its emails, and recount first and last order.
  if (!keepCustomer && email && !email.includes('/')) await detachFromCustomer(email, id);

  await db.collection('deletedOrders').doc(id).set({
    orderNumber: o.orderNumber || '', livemode: !!(o.stripe && o.stripe.livemode), status: o.status || '',
    deletedAt: FieldValue.serverTimestamp(), by: by || '',
  });
  await db.recursiveDelete(ref); // the order and anything filed under it
  return { orderNumber: orderNo(id, o), ...done };
}

async function detachFromCustomer(email, orderId) {
  const ref = db.collection('customers').doc(email);
  const snap = await ref.get();
  if (!snap.exists) return;
  const c = snap.data();
  const left = (c.orderIds || []).filter(x => x !== orderId);
  const remaining = left.length ? (await db.getAll(...left.map(x => db.collection('orders').doc(x)))).filter(d => d.exists) : [];
  const times = remaining.map(d => d.get('createdAt')).filter(t => t && t.toMillis).sort((a, b) => a.toMillis() - b.toMillis());
  const emails = (c.emails || []).filter(e => e.orderId !== orderId);
  const update = {
    orderIds: remaining.map(d => d.id),
    emails,
    firstOrderAt: times[0] || null,
    lastOrderAt: times[times.length - 1] || null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  // Invited because of this order, and the link is gone: no longer invited.
  if (!remaining.length && c.account && c.account.status === 'invited') {
    const open = await db.collection('accountInvites').where('email', '==', email).where('usedAt', '==', null).limit(1).get();
    if (open.empty) update.account = FieldValue.delete();
  }
  // A record that only existed for this order (a test order, usually) goes with it.
  const keep = remaining.length || c.uid || (c.notes || '').trim() || c.welcome || emails.length || c.unsubscribed
    || (c.account && update.account === undefined);
  if (!keep) {
    const [signups, msgs] = await Promise.all([
      db.collection('signups').where('email', '==', email).limit(1).get(),
      db.collection('messages').where('email', '==', email).limit(1).get(),
    ]);
    if (signups.empty && msgs.empty) { await ref.delete(); return; }
  }
  await ref.update(update);
}

export async function deleteOrder(id, { confirm, by }) {
  const snap = await db.collection('orders').doc(id).get();
  if (!snap.exists) throw new HttpError(404, 'Order not found');
  const no = orderNo(id, snap.data());
  if (String(confirm || '').trim().replace(/^#/, '').toUpperCase() !== no.toUpperCase()) {
    throw new HttpError(400, `Type the order number (${no}) to confirm`);
  }
  return cascadeOrder(id, { by });
}

/** Whether a Stripe webhook should leave this order alone (it was deleted here). */
export async function wasDeleted(orderId) {
  return (await db.collection('deletedOrders').doc(orderId).get()).exists;
}

// ---- Customers (privacy erasure) -------------------------------------------

/** Takes them out of Resend: the contact (all segments) and any older audience lists. */
async function eraseFromResend(email) {
  if (!resend) return { contacts: 0, skipped: 'Resend is not configured' };
  let contacts = 0;
  const errors = [];
  const gone = r => r && r.error && (r.error.statusCode === 404 || /not.?found/i.test(r.error.name || r.error.message || ''));
  const remove = async opts => {
    const r = await resend.contacts.remove(opts);
    if (r && r.data && r.data.deleted) contacts++;
    else if (r && r.error && !gone(r)) errors.push(r.error.message || String(r.error));
  };
  await remove({ email });
  try {
    const lists = await resend.audiences.list();
    for (const a of (lists && lists.data && lists.data.data) || []) await remove({ email, audienceId: a.id });
  } catch (err) {
    errors.push(err.message || String(err));
  }
  return { contacts, ...(errors.length ? { errors } : {}) };
}

/** Their uids: the customer record, their sign-in, and any account with their email. */
async function uidsFor(email, cust) {
  const uids = new Set();
  if (cust && typeof cust.uid === 'string' && cust.uid) uids.add(cust.uid);
  try { uids.add((await getAuth().getUserByEmail(email)).uid); } catch { /* none */ }
  (await db.collection('accounts').where('email', '==', email).select().get()).docs.forEach(d => uids.add(d.id));
  return [...uids];
}

export async function eraseCustomer(rawEmail, { confirm, by }) {
  const email = customerId(rawEmail);
  if (!email || email.includes('/')) throw new HttpError(400, 'That email address doesn’t look right');
  if (customerId(confirm) !== email) throw new HttpError(400, `Type their email (${email}) to confirm`);

  const custRef = db.collection('customers').doc(email);
  const custSnap = await custRef.get();
  const cust = custSnap.exists ? custSnap.data() : null;
  const uids = await uidsFor(email, cust);
  for (const uid of uids) {
    const user = await getAuth().getUser(uid).catch(() => null);
    if (user && user.customClaims && user.customClaims.admin === true) {
      throw new HttpError(409, 'This email belongs to an admin. Remove their admin access first.');
    }
  }
  const counts = { orders: 0, piecesUnassigned: 0, piecesScrubbed: 0, transfers: 0, messages: 0, signups: 0, invites: 0, accounts: 0, signIns: 0 };

  // 1. Orders, with all their references.
  const orders = uniqueDocs([
    ...(await db.collection('orders').where('customerId', '==', email).select().get()).docs,
    ...(await db.collection('orders').where('customer.email', '==', email).select().get()).docs,
  ]).map(d => d.id);
  for (const id of new Set([...orders, ...((cust && cust.orderIds) || [])])) {
    const r = await cascadeOrder(id, { by, keepCustomer: true });
    if (r) { counts.orders++; counts.piecesUnassigned += r.pieces; }
  }

  // 2. Piece transfers to or from them. Open ones are cancelled first (which tidies
  //    the other person's portal), then all of them go.
  const transfers = uniqueDocs([
    ...(await db.collection('pieceTransfers').where('fromEmail', '==', email).get()).docs,
    ...(await db.collection('pieceTransfers').where('toEmail', '==', email).get()).docs,
    ...(await whereIn('pieceTransfers', 'fromUid', uids)),
    ...(await whereIn('pieceTransfers', 'toUid', uids)),
  ]);
  for (const d of transfers) if (d.get('status') === 'pending') await closeTransfer(d.id, 'cancelled', { cancelledBy: 'admin' });
  const transferInvites = await whereIn('accountInvites', 'transfer.id', transfers.map(d => d.id));
  await Promise.all([...transfers, ...transferInvites].map(d => d.ref.delete()));
  counts.transfers = transfers.length;

  // 3. Pieces they own or owned through a transfer: their name comes out of the
  //    history, and a piece they hold now belongs to nobody we know.
  const mine = entry => entry && (entry.email === email || (entry.uid && uids.includes(entry.uid)));
  const allPieces = await db.collection('pieces').get();
  for (const d of allPieces.docs) {
    const p = d.data();
    const holds = p.ownerEmail === email || (p.ownerUid && uids.includes(p.ownerUid));
    const inHistory = (p.owners || []).some(mine);
    const inReturns = (p.returns || []).some(r => r && (r.owners || []).some(mine));
    if (!holds && !inHistory && !inReturns) continue;
    const scrub = list => list.map(e => (mine(e) ? { uid: null, email: '', erased: true, via: e.via || '', at: e.at || null } : e));
    await d.ref.update({
      ...(holds ? { ownerUid: ERASED_OWNER, ownerEmail: '' } : {}),
      ...(inHistory ? { owners: scrub(p.owners) } : {}),
      ...(inReturns ? { returns: p.returns.map(r => (r && Array.isArray(r.owners) ? { ...r, owners: scrub(r.owners) } : r)) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await syncPiece(d.id);
    counts.piecesScrubbed++;
  }

  // 3b. Returns still filed under their email (their orders' returns went with the orders).
  const theirReturns = (await db.collection('returns').where('customerEmail', '==', email).get()).docs;
  await Promise.all(theirReturns.map(d => d.ref.delete()));
  counts.returns = theirReturns.length;

  // 4. Support messages (contact form and portal), waitlist sign-ups, claim links.
  const messages = uniqueDocs([...(await db.collection('messages').where('email', '==', email).get()).docs, ...(await whereIn('messages', 'uid', uids))]);
  const signups = (await db.collection('signups').where('email', '==', email).get()).docs;
  const invites = (await db.collection('accountInvites').where('email', '==', email).get()).docs;
  await Promise.all([...messages, ...signups, ...invites].map(d => d.ref.delete()));
  Object.assign(counts, { messages: messages.length, signups: signups.length, invites: invites.length });

  // 5. Portal accounts (orders, pieces, conversations, saved bag, offers) and sign-ins.
  for (const uid of uids) {
    const acc = db.collection('accounts').doc(uid);
    if ((await acc.get()).exists || (await acc.listCollections()).length) counts.accounts++;
    await db.recursiveDelete(acc);
    try { await getAuth().deleteUser(uid); counts.signIns++; } catch (err) { if (!(err && err.code === 'auth/user-not-found')) throw err; }
  }

  // 6. The customer record, then Resend.
  await custRef.delete();
  const resendResult = await eraseFromResend(email);

  await db.collection('erasures').add({ at: Timestamp.now(), by: by || '', counts, resend: resendResult });
  return { ok: true, ...counts, resend: resendResult };
}
