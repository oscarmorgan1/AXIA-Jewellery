// /api/account/*  The customer portal at /portal.
//
// A customer account is a Firebase Auth user (password, or Google with the same
// email) plus `accounts/{uid}`. Customers can read only their own accounts/{uid}
// folder (firestore.rules) and write nothing there directly: every change goes
// through this API, which takes the uid and email from the verified ID token,
// never from the request body.
//
// Accounts start from an invite. When an order is paid and that email has no
// account yet, the buyer is emailed a "Claim your AXIA account" link
// (/portal/claim?t=<token>, 30 days). Only the token's SHA-256 is stored, in
// the server-only `accountInvites/{hash}`, so a database read can't be turned
// into a working link.
//
//   POST /api/account/invite          what an invite link is for (email, state)
//   POST /api/account/invite/renew    emails a fresh link for an expired one
//   POST /api/account/claim           sets a password and creates the account
//   POST /api/account/password-reset  emails a reset link (always answers ok)
//   POST /api/account/session         signed in: makes sure accounts/{uid} exists
//   POST /api/account/profile         signed in: name, phone, address
//   POST /api/account/marketing       signed in: news and offers on or off
//   POST /api/account/cart/get        signed in: their saved bag
//   POST /api/account/cart            signed in: saves the bag (accounts/{uid}/saved/cart)
//   POST /api/account/orders/:id/receipt  signed in: the Stripe receipt link for one of their orders
//   POST /api/account/messages        signed in: starts a support conversation (lands in the admin Inbox)
//   POST /api/account/messages/:id/reply  signed in: adds to one of their conversations
//   POST /api/account/messages/:id/read   signed in: marks the team's replies as read
//   Piece transfers between accounts: server/transfers.js
import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, resend } from './services.js';
import { customerId } from './orders.js';
import { setSubscribed } from './unsubscribe.js';
import { accountInviteEmail, passwordResetEmail, sendEmail, brandUrl } from './email.js';
import { rateLimit, clientIp } from './limit.js';
import { syncCustomerOrders, stripeReceipt, syncThread } from './sync.js';
import { alertTeam } from './forms.js';
import { settleTransfers, resendTransferOffer } from './transfers.js';

export const INVITE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_PASSWORD = 8;
export const SUPPORT_TOPICS = ['My order', 'Sizing', 'Care and repairs', 'Something else'];

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const hashToken = token => createHash('sha256').update(String(token)).digest('hex');
const millis = t => (t && typeof t.toMillis === 'function' ? t.toMillis() : null);

/** The Firebase Auth user for an email, or null. */
export async function findUser(email) {
  try { return await getAuth().getUserByEmail(email); } catch (err) {
    if (err && err.code === 'auth/user-not-found') return null;
    throw err;
  }
}

/** Marks the customer record as having an account (the admin Customers page shows it). */
async function markActive(email, uid) {
  await db.collection('customers').doc(email).set({
    email, uid, account: { status: 'active', uid, since: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * Emails a "Claim your AXIA account" link to this buyer, unless they already have
 * an account. Returns { status: 'sent' | 'skipped' | 'has_account', subject?, sent? }.
 */
export async function sendAccountInvite({ email, name, orderId, orderNumber, siteUrl }) {
  const id = customerId(email);
  if (!id || id.includes('/')) return { status: 'skipped' };
  if (await findUser(id)) return { status: 'has_account' };

  const url = await createInvite({ email: id, name, orderId, orderNumber });
  const mail = accountInviteEmail({ name, orderNumber, url, days: INVITE_DAYS, siteUrl });
  const sent = await sendEmail({ to: id, ...mail });
  await markInvited(id);
  return { status: sent ? 'sent' : 'skipped', subject: mail.subject, sent };
}

/**
 * Saves a new claim link for this email and returns its URL. `transfer` makes it
 * the link in a piece transfer offer: the claim page says what's waiting and
 * opens Pieces afterwards.
 */
export async function createInvite({ email, name, orderId, orderNumber, transfer }) {
  const token = randomBytes(32).toString('base64url');
  await db.collection('accountInvites').doc(hashToken(token)).set({
    email, name: str(name, 100), orderId: orderId || null, orderNumber: orderNumber || '',
    ...(transfer ? { transfer } : {}),
    createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + INVITE_DAYS * DAY_MS), usedAt: null,
  });
  const url = `${brandUrl()}/portal/claim?t=${token}`;
  if (!resend) console.log(`account: invite link for ${email}: ${url}`); // local runs without Resend
  return url;
}

/** Marks the customer record as invited (the admin Customers page shows it). */
export async function markInvited(id) {
  // Doesn't downgrade an account that was claimed in the meantime.
  await db.runTransaction(async tx => {
    const ref = db.collection('customers').doc(id);
    const snap = await tx.get(ref);
    if (snap.exists && snap.get('account.status') === 'active') return;
    tx.set(ref, { email: id, account: { status: 'invited', invitedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

/** The invite behind a link, with its state. Throws 404 for an unknown token. */
async function readInvite(token) {
  const t = str(token, 100);
  if (t.length < 20) throw new HttpError(404, 'That link isn’t valid. Use the button in your latest email.');
  const ref = db.collection('accountInvites').doc(hashToken(t));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'That link isn’t valid. Use the button in your latest email.');
  const inv = snap.data();
  const user = await findUser(inv.email);
  const state = user ? 'has_account'
    : inv.usedAt || inv.replacedAt ? 'used'
    : millis(inv.expiresAt) < Date.now() ? 'expired' : 'ready';
  return { ref, inv, user, state };
}

/** Creates accounts/{uid} on first sign-in, filled from their customer record. Returns the account. */
export async function ensureAccount(uid, email, { name } = {}) {
  const id = customerId(email);
  const ref = db.collection('accounts').doc(uid);
  const snap = await ref.get();
  if (snap.exists) return snap.data();
  const cust = await db.collection('customers').doc(id).get();
  const c = cust.exists ? cust.data() : {};
  const account = {
    email: id,
    name: str(name, 100) || c.name || '',
    phone: c.phone || '',
    address: c.address || null,
    // Buyers are on the list unless they unsubscribed. Someone who signs in with
    // Google without ever ordering hasn't asked for news, so starts off.
    marketing: { email: cust.exists && Array.isArray(c.orderIds) && c.orderIds.length > 0 && !c.unsubscribed },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(account);
  if (cust.exists) {
    await markActive(id, uid);
    await syncCustomerOrders(uid, id); // their order history, from day one
  }
  return account;
}

export async function requireCustomer(req, res, next) {
  try {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Sign in again');
    const user = await getAuth().verifyIdToken(token, true);
    if (!user.email || user.email_verified !== true) throw new HttpError(403, 'Verify your email address first');
    req.customer = { uid: user.uid, email: customerId(user.email), name: user.name || '' };
    next();
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : 'Sign in again' });
  }
}

const handle = fn => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    res.json(await fn(req));
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(`account: ${req.method} ${req.path} failed`, err);
    res.status(500).json({ error: 'Something went wrong. Please try again in a moment.' });
  }
};

const limited = (limiter, message) => (req, res, next) => (limiter(clientIp(req))
  ? res.status(429).json({ error: message }) : next());

function cleanAddress(a) {
  if (!a || typeof a !== 'object') return null;
  const out = {
    line1: str(a.line1, 120), line2: str(a.line2, 120) || null, city: str(a.city, 80),
    state: str(a.state, 40), postal_code: str(a.postal_code, 12), country: str(a.country, 2).toUpperCase() || 'AU',
  };
  return out.line1 || out.city || out.postal_code ? out : null;
}

const MAX_LINES = 40;
const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; };
const imgPath = v => { const t = str(v, 400); return /^(assets\/|\/assets\/|https:\/\/)[^"'<>\s]*$/.test(t) ? t : ''; };

/**
 * The storefront bag (assets/js/axia.js lines), cleaned. It's only a saved list:
 * checkout prices every line again on the server (server/pricing.js).
 */
export function cleanCart(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.slice(0, MAX_LINES).filter(l => l && typeof l === 'object' && str(l.name, 160)).map(l => ({
    id: str(l.id, 100), name: str(l.name, 160), price: Math.round(num(l.price, 0, 100000) * 100) / 100, opt: str(l.opt, 200),
    img: imgPath(l.img), width: str(l.width, 40), length: str(l.length, 40), colour: str(l.colour, 40), engraving: str(l.engraving, 60),
    q: Math.round(num(l.q, 1, 20)),
  }));
}

export function accountRoutes() {
  const router = express.Router();
  const json = express.json({ limit: '8kb' });
  const tooManyChecks = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });
  const tooManyClaims = rateLimit({ windowMs: 10 * 60 * 1000, max: 10 });
  const tooManyEmails = rateLimit({ windowMs: 10 * 60 * 1000, max: 5 });
  const slowDown = 'Too many tries from here. Please wait a few minutes and try again.';

  router.post('/api/account/invite', json, limited(tooManyChecks, slowDown), handle(async req => {
    const { inv, state } = await readInvite(req.body && req.body.token);
    return { state, email: inv.email, name: inv.name || '', orderNumber: inv.orderNumber || '',
      ...(inv.transfer ? { transfer: { productName: inv.transfer.productName || '', fromName: inv.transfer.fromName || '' } } : {}) };
  }));

  router.post('/api/account/invite/renew', json, limited(tooManyEmails, slowDown), handle(async req => {
    const { ref, inv, state } = await readInvite(req.body && req.body.token);
    if (state === 'has_account') return { state };
    if (state === 'ready') throw new HttpError(400, 'This link still works. Set your password below.');
    const renewed = millis(inv.renewedAt);
    if (renewed && Date.now() - renewed < 60 * 1000) throw new HttpError(429, 'We’ve just sent one. Check your inbox (and spam).');
    await ref.update({ renewedAt: FieldValue.serverTimestamp(), replacedAt: FieldValue.serverTimestamp() });
    // A transfer link renews as the transfer offer (if it's still open), any other as the claim email.
    if (inv.transfer && inv.transfer.id) await resendTransferOffer(inv.transfer.id);
    else await sendAccountInvite({ email: inv.email, name: inv.name, orderId: inv.orderId, orderNumber: inv.orderNumber, siteUrl: process.env.PUBLIC_SITE_URL || brandUrl() });
    return { state: 'sent' };
  }));

  router.post('/api/account/claim', json, limited(tooManyClaims, slowDown), handle(async req => {
    const b = req.body || {};
    const password = typeof b.password === 'string' ? b.password : '';
    if (password.length < MIN_PASSWORD) throw new HttpError(400, `Use at least ${MIN_PASSWORD} characters for your password.`);
    if (password.length > 128) throw new HttpError(400, 'That password is too long.');
    const { ref, inv, state } = await readInvite(b.token);
    if (state === 'has_account') throw new HttpError(409, 'You already have an account. Sign in instead.');
    if (state === 'used') throw new HttpError(410, 'This link has already been used. Sign in, or use the link in your latest email.');
    if (state === 'expired') throw new HttpError(410, 'This link has expired.');

    // One claim per link, even if two tabs submit at once.
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.get('usedAt')) throw new HttpError(410, 'This link has already been used.');
      tx.update(ref, { usedAt: FieldValue.serverTimestamp() });
    });
    const name = str(b.name, 100) || inv.name || '';
    let user;
    try {
      // They opened the link from their inbox, so the address is verified.
      user = await getAuth().createUser({ email: inv.email, password, emailVerified: true, ...(name ? { displayName: name } : {}) });
    } catch (err) {
      await ref.update({ usedAt: null });
      if (err && err.code === 'auth/email-already-exists') throw new HttpError(409, 'You already have an account. Sign in instead.');
      if (err && err.code === 'auth/invalid-password') throw new HttpError(400, `Use at least ${MIN_PASSWORD} characters for your password.`);
      throw err;
    }
    await ensureAccount(user.uid, inv.email, { name });
    await markActive(inv.email, user.uid);
    await setSubscribed(inv.email, b.marketing === true, 'portal');
    await ref.update({ uid: user.uid });
    return { ok: true, email: inv.email, next: inv.transfer ? '/pieces' : '/orders' };
  }));

  router.post('/api/account/password-reset', json, limited(tooManyEmails, slowDown), handle(async req => {
    const email = customerId(str(req.body && req.body.email, 200));
    if (!/^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(email)) throw new HttpError(400, 'Enter the email address you sign in with.');
    // Same answer whether or not there's an account, so this can't be used to find customers.
    const user = await findUser(email);
    if (user && user.providerData.some(p => p.providerId === 'password')) {
      const link = await getAuth().generatePasswordResetLink(email);
      const code = new URL(link).searchParams.get('oobCode');
      const url = `${brandUrl()}/portal/reset?oobCode=${encodeURIComponent(code)}`;
      if (!resend) console.log(`account: password reset link for ${email}: ${url}`);
      await sendEmail({ to: email, ...passwordResetEmail({ url, siteUrl: process.env.PUBLIC_SITE_URL || brandUrl() }) });
    }
    return { ok: true };
  }));

  router.use(['/api/account/session', '/api/account/profile', '/api/account/marketing', '/api/account/cart', '/api/account/orders', '/api/account/messages'], express.json({ limit: '64kb' }), requireCustomer);

  router.post('/api/account/session', handle(async req => {
    await ensureAccount(req.customer.uid, req.customer.email, { name: req.customer.name });
    // Transfers sent to this email (including before the account existed), and any that ran out.
    await settleTransfers(req.customer.uid, req.customer.email);
    return { ok: true };
  }));

  router.post('/api/account/profile', handle(async req => {
    const b = req.body || {};
    const name = str(b.name, 100);
    const phone = str(b.phone, 30);
    if (!name) throw new HttpError(400, 'Add your name.');
    if (phone && !/^[+\d][\d\s()-]{5,}$/.test(phone)) throw new HttpError(400, 'That phone number doesn’t look right.');
    const address = cleanAddress(b.address);
    const { uid, email } = req.customer;
    await ensureAccount(uid, email);
    const batch = db.batch();
    batch.update(db.collection('accounts').doc(uid), { name, phone, address, updatedAt: FieldValue.serverTimestamp() });
    batch.set(db.collection('customers').doc(email), { email, name, phone, address, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
    await getAuth().updateUser(uid, { displayName: name }).catch(err => console.error('account: displayName not updated', err));
    return { ok: true };
  }));

  router.post('/api/account/marketing', handle(async req => {
    const { uid, email } = req.customer;
    await ensureAccount(uid, email);
    const on = (req.body || {}).email === true;
    await setSubscribed(email, on, 'portal');
    await db.collection('accounts').doc(uid).update({ marketing: { email: on }, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true };
  }));

  // Their own orders only: the portal copy (accounts/{uid}/orders/{id}) proves it's theirs.
  router.post('/api/account/orders/:id/receipt', handle(async req => {
    const id = str(req.params.id, 300);
    const mine = await db.collection('accounts').doc(req.customer.uid).collection('orders').doc(id).get();
    if (!id || !mine.exists) throw new HttpError(404, 'Order not found');
    try {
      const { url } = await stripeReceipt(db.collection('orders').doc(id));
      return { url };
    } catch (err) {
      if (err.status === 404 || err.status === 503) throw new HttpError(404, 'Your receipt isn’t ready yet. Try again later, or contact us.');
      throw err;
    }
  }));

  // The saved bag. `at` is when the bag last changed on the device that sent it,
  // so the newest bag wins when they shop on more than one device.
  const cartRef = uid => db.collection('accounts').doc(uid).collection('saved').doc('cart');
  router.post('/api/account/cart/get', handle(async req => {
    const snap = await cartRef(req.customer.uid).get();
    return snap.exists ? { lines: cleanCart(snap.get('lines')), at: Number(snap.get('at')) || 0 } : { lines: [], at: 0 };
  }));
  router.post('/api/account/cart', handle(async req => {
    const b = req.body || {};
    const lines = cleanCart(b.lines);
    const at = Math.min(Number(b.at) || Date.now(), Date.now() + 5 * 60 * 1000);
    await cartRef(req.customer.uid).set({ lines, at, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true, at };
  }));

  // Support. A conversation is a messages/{id} doc like the contact form's (so it
  // shows in the admin Inbox), plus the sender's uid. The customer's copy is
  // accounts/{uid}/threads/{id} (server/sync.js).
  const tooManyMessages = rateLimit({ windowMs: 10 * 60 * 1000, max: 8 });
  const MAX_REPLIES = 100;
  const body = b => (typeof b === 'string' ? b.trim().slice(0, 5000) : '');
  const theirThread = async (uid, id) => {
    const ref = db.collection('messages').doc(str(id, 100));
    const snap = id ? await ref.get() : null;
    if (!snap || !snap.exists || snap.get('uid') !== uid) throw new HttpError(404, 'Conversation not found');
    return { ref, m: snap.data() };
  };
  const alert = (m, id, key) => alertTeam(m, id, key).catch(err => console.error('account: support alert failed', id, err));

  router.post('/api/account/messages', handle(async req => {
    const { uid, email } = req.customer;
    if (tooManyMessages(uid)) throw new HttpError(429, 'That’s a lot of messages at once. Please wait a few minutes, or email support@axiajewellery.com.');
    const b = req.body || {};
    const message = body(b.body);
    const topic = SUPPORT_TOPICS.includes(b.topic) ? b.topic : 'Something else';
    if (message.length < 4) throw new HttpError(400, 'Please add a short message.');
    const account = await ensureAccount(uid, email, { name: req.customer.name });
    // An order they name must be one of theirs.
    let orderId = null; let orderNumber = '';
    if (b.orderId) {
      const mine = await db.collection('accounts').doc(uid).collection('orders').doc(str(b.orderId, 300)).get();
      if (!mine.exists) throw new HttpError(404, 'Order not found');
      orderId = mine.id; orderNumber = mine.get('orderNumber') || mine.id.slice(-6).toUpperCase();
    }
    const doc = {
      name: account.name || req.customer.name || email, email, topic, order: orderNumber, orderId,
      subject: !orderNumber ? topic : topic === 'My order' ? `Order #${orderNumber}` : `${topic} · order #${orderNumber}`,
      message, status: 'new', source: 'portal', uid, customerReplies: [],
      createdAt: FieldValue.serverTimestamp(), lastAt: FieldValue.serverTimestamp(),
    };
    const ref = await db.collection('messages').add(doc);
    await syncThread(ref.id);
    alert(doc, ref.id);
    return { id: ref.id };
  }));

  router.post('/api/account/messages/:id/reply', handle(async req => {
    const { uid } = req.customer;
    if (tooManyMessages(uid)) throw new HttpError(429, 'That’s a lot of messages at once. Please wait a few minutes, or email support@axiajewellery.com.');
    const text = body((req.body || {}).body);
    if (text.length < 2) throw new HttpError(400, 'Write a message.');
    const { ref, m } = await theirThread(uid, req.params.id);
    const n = (m.customerReplies || []).length;
    if (n >= MAX_REPLIES) throw new HttpError(400, 'This conversation is full. Please start a new one.');
    const now = Timestamp.now();
    // Back to "new" in the Inbox, and read up to now (they're looking at it).
    await ref.update({ customerReplies: FieldValue.arrayUnion({ body: text, at: now }), status: 'new', lastAt: now, customerReadAt: now });
    await syncThread(ref.id);
    alert({ ...m, message: text, reply: true }, ref.id, `inquiry-alert/${ref.id}/${n + 1}`);
    return { ok: true };
  }));

  router.post('/api/account/messages/:id/read', handle(async req => {
    const { ref } = await theirThread(req.customer.uid, req.params.id);
    await ref.update({ customerReadAt: Timestamp.now() });
    await syncThread(ref.id);
    return { ok: true };
  }));

  return router;
}
