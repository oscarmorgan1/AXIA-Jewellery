// /api/admin/*  Actions the admin portal can't do with Firestore alone, because
// they need the Stripe or Resend keys: changing an order's status (and emailing
// the customer) and managing promo codes in Stripe.
//
// Every request must carry the signed-in admin's Firebase ID token
// (Authorization: Bearer <token>) with the `admin: true` custom claim.
import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, stripe } from './services.js';
import { STATUS_EMAILS, statusEmail, sendEmail } from './email.js';
import { emailEntry, historyEntry, push } from './orders.js';

/** Statuses an admin can set. `refunded` only comes from Stripe, with the money. */
export const ADMIN_STATUSES = ['paid', 'in_progress', 'shipped', 'fulfilled', 'cancelled'];

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

async function requireAdmin(req, res, next) {
  try {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Sign in again');
    const user = await getAuth().verifyIdToken(token);
    if (user.admin !== true) throw new HttpError(403, 'Not an admin');
    req.admin = { uid: user.uid, email: user.email || '' };
    next();
  } catch (err) {
    res.status(err.status || 401).json({ error: err.status ? err.message : 'Sign in again' });
  }
}

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function siteOrigin(req, order) {
  const host = req.get('x-forwarded-host') || req.get('host');
  return (process.env.PUBLIC_SITE_URL || (order && order.siteUrl) || `${req.protocol}://${host}`).replace(/\/$/, '');
}

async function changeStatus(req) {
  const ref = db.collection('orders').doc(str(req.params.id, 300));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Order not found');
  const order = snap.data();

  const status = str(req.body.status, 40);
  if (!ADMIN_STATUSES.includes(status)) throw new HttpError(400, 'Unknown status');
  const notify = req.body.notify !== false && !!STATUS_EMAILS[status];
  const tracking = status === 'shipped' ? {
    carrier: str(req.body.tracking && req.body.tracking.carrier, 60),
    number: str(req.body.tracking && req.body.tracking.number, 80),
    url: /^https:\/\//.test(str(req.body.tracking && req.body.tracking.url, 500)) ? str(req.body.tracking.url, 500) : '',
  } : null;
  const note = str(req.body.note, 1000);

  const update = {
    status,
    updatedAt: FieldValue.serverTimestamp(),
    ...(tracking ? { tracking } : {}),
  };
  let email = null;
  if (notify) {
    if (!order.customer || !order.customer.email) throw new HttpError(400, 'This order has no customer email');
    const mail = statusEmail(order, status, siteOrigin(req, order), { tracking, note });
    // Keyed by order, status and second, so a double click doesn't send twice.
    const key = `order-status/${ref.id}/${status}/${Math.floor(Date.now() / 10000)}`;
    const sent = await sendEmail({ to: order.customer.email, ...mail, idempotencyKey: key });
    email = emailEntry(`status:${status}`, order.customer.email, mail.subject, sent);
    update.emails = push(email);
  }
  update.statusHistory = push(historyEntry(status, req.admin.email || req.admin.uid, {
    emailed: !!(email && email.resendId), ...(note ? { note } : {}), ...(tracking ? { tracking } : {}),
  }));
  await ref.update(update);
  return { status, email: email && { resendId: email.resendId, status: email.status } };
}

// ---- Promo codes: a Stripe coupon (the discount) plus a promotion code (what
// the customer types). Saved in Firestore `promoCodes/{promotionCodeId}`;
// sales per code are worked out in the portal from orders.promotionCodeId.

const CODE = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;

async function createPromo(req) {
  if (!stripe) throw new HttpError(503, 'Stripe is not configured');
  const code = str(req.body.code, 30).toUpperCase();
  if (!CODE.test(code)) throw new HttpError(400, 'Codes are 3 to 30 letters, numbers, - or _');
  const percentOff = Number(req.body.percentOff);
  if (!(percentOff > 0 && percentOff <= 100)) throw new HttpError(400, 'Discount must be between 1 and 100%');
  const kind = req.body.kind === 'affiliate' ? 'affiliate' : 'standard';
  const affiliate = kind === 'affiliate' ? { name: str(req.body.affiliateName, 80), email: str(req.body.affiliateEmail, 120) } : null;
  if (affiliate && !affiliate.name) throw new HttpError(400, 'Add the affiliate’s name');
  const maxRedemptions = Number(req.body.maxRedemptions) > 0 ? Math.floor(Number(req.body.maxRedemptions)) : null;
  const expires = req.body.expiresAt ? Date.parse(req.body.expiresAt) : NaN;
  if (req.body.expiresAt && !(expires > Date.now())) throw new HttpError(400, 'The end date must be in the future');

  const existing = await db.collection('promoCodes').where('code', '==', code).limit(1).get();
  if (!existing.empty) throw new HttpError(409, `${code} already exists`);

  const metadata = { kind, ...(affiliate ? { affiliate: affiliate.name } : {}) };
  const coupon = await stripe.coupons.create({ percent_off: percentOff, duration: 'once', name: `${code} (${percentOff}% off)`, metadata });
  const promo = await stripe.promotionCodes.create({
    promotion: { type: 'coupon', coupon: coupon.id },
    code,
    metadata,
    ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
    ...(expires > 0 ? { expires_at: Math.floor(expires / 1000) } : {}),
  });
  const doc = {
    code, kind, percentOff, affiliate, active: true,
    maxRedemptions, expiresAt: expires > 0 ? Timestamp.fromMillis(expires) : null,
    stripe: { couponId: coupon.id, promotionCodeId: promo.id, livemode: !!promo.livemode },
    createdAt: FieldValue.serverTimestamp(), createdBy: req.admin.email || req.admin.uid,
  };
  await db.collection('promoCodes').doc(promo.id).set(doc);
  return { id: promo.id };
}

async function setPromoActive(req) {
  if (!stripe) throw new HttpError(503, 'Stripe is not configured');
  const ref = db.collection('promoCodes').doc(str(req.params.id, 100));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Code not found');
  const active = req.body.active === true;
  await stripe.promotionCodes.update(snap.get('stripe.promotionCodeId'), { active });
  await ref.update({ active, updatedAt: FieldValue.serverTimestamp() });
  return { active };
}

async function listPromos() {
  const snap = await db.collection('promoCodes').orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => {
    const v = d.data();
    return {
      id: d.id, ...v,
      createdAt: v.createdAt ? v.createdAt.toMillis() : null,
      expiresAt: v.expiresAt ? v.expiresAt.toMillis() : null,
      updatedAt: v.updatedAt ? v.updatedAt.toMillis() : null,
    };
  });
}

const handle = fn => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(`admin: ${req.method} ${req.path} failed`, err);
    const stripeMsg = err && err.type && String(err.type).startsWith('Stripe') ? err.message : '';
    res.status(500).json({ error: stripeMsg ? `Stripe: ${stripeMsg}` : `Something went wrong: ${err.message || err}` });
  }
};

export function adminRoutes() {
  const router = express.Router();
  router.use('/api/admin', express.json({ limit: '32kb' }), requireAdmin);
  router.post('/api/admin/orders/:id/status', handle(changeStatus));
  router.get('/api/admin/promos', handle(listPromos));
  router.post('/api/admin/promos', handle(createPromo));
  router.post('/api/admin/promos/:id/active', handle(setPromoActive));
  return router;
}
