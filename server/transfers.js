// Piece transfers: a customer hands one of their pieces to someone else's account.
//
// pieceTransfers/{id} is server-only (no rule in firestore.rules). A transfer is
// `pending` until the recipient accepts or declines it, the sender cancels it,
// or TRANSFER_DAYS pass (`expired`). While it's pending the piece remembers it
// (`pieces/{key}.transfer`), so a piece is only ever offered to one person.
//
// Accepting moves the piece: `pieces/{key}.ownerUid` overrides the order's buyer
// as the owner (server/sync.js), and `owners` keeps the history the admin sees.
// The public /genuine check doesn't change: it never shows who owns a piece.
//
// What each side sees:
//   sender     accounts/{uid}/pieces/{key}.transfer  {id, toEmail, expiresAt} while pending
//   recipient  accounts/{uid}/incoming/{id}          the offer, while pending
//
//   POST /api/account/pieces/:key/transfer   sender: {email, note} starts one
//   POST /api/account/transfers/:id/cancel   sender
//   POST /api/account/transfers/:id/accept   recipient (signed in with the address it was sent to)
//   POST /api/account/transfers/:id/decline  recipient
import express from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './services.js';
import { customerId } from './orders.js';
import { requireCustomer, findUser, createInvite, markInvited } from './account.js';
import { syncPiece, customerPiece } from './sync.js';
import { transferOfferEmail, transferResultEmail, sendEmail, brandUrl } from './email.js';
import { rateLimit } from './limit.js';

export const TRANSFER_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ms = t => (t && typeof t.toMillis === 'function' ? t.toMillis() : null);
const sydneyDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
const site = () => process.env.PUBLIC_SITE_URL || brandUrl();
const piecesUrl = id => `${brandUrl()}/portal/pieces${id ? `?transfer=${encodeURIComponent(id)}` : ''}`;
const transfers = () => db.collection('pieceTransfers');

/** The recipient's copy of an offer: what's coming and from whom, never the sender's email. */
export function incomingOffer(t, piece, product) {
  const p = customerPiece(piece || {}, null, product);
  return {
    key: t.key, serial: t.serial || p.serial, productName: t.productName || p.productName, variant: p.variant, image: p.image,
    fromName: t.fromName || '', note: t.note || '', sentAt: ms(t.createdAt), expiresAt: ms(t.expiresAt),
  };
}

/** Writes or removes the recipient's copy of one transfer. Never throws. */
export async function syncIncoming(id) {
  try {
    const snap = await transfers().doc(id).get();
    if (!snap.exists) return;
    const t = snap.data();
    const user = await findUser(t.toEmail);
    if (!user) return; // no account yet: copied when they make one (settleTransfers)
    const ref = db.collection('accounts').doc(user.uid).collection('incoming').doc(id);
    if (t.status !== 'pending') { await ref.delete(); return; }
    const piece = await db.collection('pieces').doc(t.key).get();
    const pid = piece.exists && piece.get('productId');
    const product = pid ? await db.collection('products').doc(pid).get() : null;
    await ref.set({ ...incomingOffer(t, piece.exists ? piece.data() : null, product && product.exists ? product.data() : null), syncedAt: FieldValue.serverTimestamp() });
  } catch (err) {
    console.error('transfer: incoming copy failed', id, err);
  }
}

/**
 * Ends a pending transfer (cancelled, declined, expired). Returns the transfer
 * as it was, or null if it had already ended.
 */
async function close(id, status, extra = {}) {
  const ref = transfers().doc(id);
  const t = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('status') !== 'pending') return null;
    const data = snap.data();
    const pieceRef = db.collection('pieces').doc(data.key);
    const piece = await tx.get(pieceRef);
    tx.update(ref, { status, endedAt: FieldValue.serverTimestamp(), ...extra });
    if (piece.exists && piece.get('transfer.id') === id) tx.update(pieceRef, { transfer: null });
    return data;
  });
  if (t) await Promise.all([syncPiece(t.key), syncIncoming(id)]);
  return t;
}

async function tellSender(t, outcome) {
  const mail = transferResultEmail({ name: t.fromName, productName: t.productName, toEmail: t.toEmail, outcome, url: piecesUrl(), siteUrl: site() });
  await sendEmail({ to: t.fromEmail, ...mail, idempotencyKey: `transfer/${t.id}/${outcome}` })
    .catch(err => console.error('transfer: sender email failed', t.id, err));
}

/** Expires one transfer if its time is up, and tells the sender. Returns true if it expired. */
async function expireIfDue(id, t) {
  if (t.status !== 'pending' || (ms(t.expiresAt) || Infinity) > Date.now()) return false;
  const was = await close(id, 'expired');
  if (was) await tellSender({ ...was, id }, 'expired');
  return true;
}

/** Expires every overdue transfer. Run on start and every few hours (server/index.js). */
export async function sweepExpiredTransfers() {
  try {
    const snap = await transfers().where('status', '==', 'pending').get();
    for (const d of snap.docs) await expireIfDue(d.id, d.data());
  } catch (err) {
    console.error('transfer: sweep failed', err);
  }
}

/** On sign-in: expires their overdue transfers, both ways, and copies offers sent to their email. */
export async function settleTransfers(uid, email) {
  try {
    const [out, inc] = await Promise.all([
      transfers().where('fromUid', '==', uid).where('status', '==', 'pending').get(),
      transfers().where('toEmail', '==', customerId(email)).where('status', '==', 'pending').get(),
    ]);
    for (const d of out.docs) await expireIfDue(d.id, d.data());
    for (const d of inc.docs) if (!(await expireIfDue(d.id, d.data()))) await syncIncoming(d.id);
  } catch (err) {
    console.error('transfer: settle failed', uid, err);
  }
}

/** Emails the offer: to their Pieces tab, or with a claim link when they have no account yet. */
async function sendOffer(id, t) {
  const hasAccount = !!(await findUser(t.toEmail));
  const url = hasAccount ? piecesUrl(id)
    : await createInvite({ email: t.toEmail, name: '', transfer: { id, productName: t.productName, fromName: t.fromName } });
  const mail = transferOfferEmail({ fromName: t.fromName, productName: t.productName, note: t.note, url, days: TRANSFER_DAYS, hasAccount, siteUrl: site() });
  const sent = await sendEmail({ to: t.toEmail, ...mail });
  if (!hasAccount) await markInvited(t.toEmail);
  return sent;
}

/** A fresh offer email for a still-open transfer (from an expired claim link). */
export async function resendTransferOffer(id) {
  const snap = await transfers().doc(id).get();
  if (!snap.exists || snap.get('status') !== 'pending' || await expireIfDue(id, snap.data())) {
    throw new HttpError(410, 'This transfer is no longer open. Ask the sender to send it again.');
  }
  await sendOffer(id, snap.data());
}

const handle = fn => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    res.json(await fn(req));
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(`transfer: ${req.method} ${req.path} failed`, err);
    res.status(500).json({ error: 'Something went wrong. Please try again in a moment.' });
  }
};

export function transferRoutes() {
  const router = express.Router();
  const tooMany = rateLimit({ windowMs: 10 * 60 * 1000, max: 6 });
  router.use(['/api/account/pieces', '/api/account/transfers'], express.json({ limit: '8kb' }), requireCustomer);

  router.post('/api/account/pieces/:key/transfer', handle(async req => {
    const { uid, email } = req.customer;
    if (tooMany(uid)) throw new HttpError(429, 'That’s a lot of transfers at once. Please wait a few minutes.');
    const key = str(req.params.key, 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const toEmail = customerId(str((req.body || {}).email, 200));
    const note = typeof (req.body || {}).note === 'string' ? req.body.note.trim().slice(0, 500) : '';
    if (!EMAIL.test(toEmail)) throw new HttpError(400, 'Enter the email address of the person you’re sending it to.');
    if (toEmail === email) throw new HttpError(400, 'That’s your own email. Enter theirs.');

    const account = await db.collection('accounts').doc(uid).get();
    const fromName = str(account.exists && account.get('name'), 100) || req.customer.name || '';
    const pieceRef = db.collection('pieces').doc(key);
    const ref = transfers().doc();
    const t = await db.runTransaction(async tx => {
      const piece = await tx.get(pieceRef);
      if (!key || !piece.exists || piece.get('portalUid') !== uid) throw new HttpError(404, 'Piece not found');
      if (piece.get('transfer.id')) throw new HttpError(409, 'This piece already has a transfer waiting. Cancel it first to send it to someone else.');
      if (piece.get('returnId')) throw new HttpError(409, 'This piece has a return open, so it can’t be transferred.');
      if (!piece.get('shippedOn')) throw new HttpError(400, 'You can transfer a piece once it has been delivered to you.');
      const data = {
        key, serial: piece.get('serial') || key, productName: piece.get('productName') || 'AXIA piece',
        fromUid: uid, fromEmail: email, fromName, toEmail, note, status: 'pending',
        createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + TRANSFER_DAYS * DAY_MS),
      };
      tx.create(ref, data);
      tx.update(pieceRef, { transfer: { id: ref.id, toEmail, expiresAt: data.expiresAt } });
      return data;
    });
    await Promise.all([syncPiece(key), syncIncoming(ref.id)]);
    const sent = await sendOffer(ref.id, t).catch(err => { console.error('transfer: offer email failed', ref.id, err); return null; });
    await ref.update({ offerEmail: { resendId: (sent && sent.id) || null, status: sent ? 'sent' : 'skipped', at: Timestamp.now() } });
    return { id: ref.id };
  }));

  const mine = async (req, side) => {
    const id = str(req.params.id, 100);
    const snap = id ? await transfers().doc(id).get() : null;
    const t = snap && snap.exists ? snap.data() : null;
    const ok = t && (side === 'from' ? t.fromUid === req.customer.uid : t.toEmail === req.customer.email);
    if (!ok) throw new HttpError(404, 'Transfer not found');
    if (await expireIfDue(id, t)) throw new HttpError(410, 'This transfer has expired.');
    if (t.status !== 'pending') throw new HttpError(410, `This transfer was already ${t.status}.`);
    return { id, t };
  };

  router.post('/api/account/transfers/:id/cancel', handle(async req => {
    const { id } = await mine(req, 'from');
    await close(id, 'cancelled');
    return { ok: true };
  }));

  router.post('/api/account/transfers/:id/decline', handle(async req => {
    const { id } = await mine(req, 'to');
    const was = await close(id, 'declined', { toUid: req.customer.uid });
    if (was) await tellSender({ ...was, id }, 'declined');
    return { ok: true };
  }));

  router.post('/api/account/transfers/:id/accept', handle(async req => {
    const { uid, email } = req.customer;
    const { id } = await mine(req, 'to');
    const ref = transfers().doc(id);
    const t = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.get('status') !== 'pending') throw new HttpError(410, 'This transfer is no longer open.');
      const data = snap.data();
      const pieceRef = db.collection('pieces').doc(data.key);
      const piece = await tx.get(pieceRef);
      // The sender must still own it (an order refund or an admin change since would stop it).
      if (!piece.exists || piece.get('transfer.id') !== id || piece.get('portalUid') !== data.fromUid) {
        throw new HttpError(409, 'This piece can’t be transferred right now. Please contact us.');
      }
      const now = Timestamp.now();
      const owners = piece.get('owners') || [];
      tx.update(pieceRef, {
        ownerUid: uid, ownerEmail: email, ownerOrderId: piece.get('orderId') || null, transferredOn: sydneyDate(), transfer: null,
        // The first transfer also records the original buyer.
        owners: [...(owners.length ? owners : [{ uid: data.fromUid, email: data.fromEmail, via: 'order', at: null }]),
          { uid, email, via: 'transfer', transferId: id, at: now }],
      });
      tx.update(ref, { status: 'accepted', toUid: uid, endedAt: now });
      return data;
    });
    await Promise.all([syncPiece(t.key), syncIncoming(id)]);
    await tellSender({ ...t, id }, 'accepted');
    return { ok: true, key: t.key };
  }));

  return router;
}
