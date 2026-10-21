// Unsubscribe links. Every email carries a personal link (and the one-click
// List-Unsubscribe header Gmail and Apple Mail show) that takes the person off
// the mailing list: their customer record is marked `unsubscribed` and their
// waitlist sign-ups lose email consent. Order and reply emails still reach
// them, since those aren't marketing.
//
// Links are signed with a key only the server knows (UNSUBSCRIBE_SECRET, or a
// random key kept in the server-only `serverConfig/unsubscribe` document), so
// nobody can unsubscribe someone else by guessing a link.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './services.js';
import { brandUrl } from './email.js';
import { customerId } from './orders.js';

let keyPromise = null;
function signingKey() {
  if (process.env.UNSUBSCRIBE_SECRET) return Promise.resolve(process.env.UNSUBSCRIBE_SECRET.trim());
  keyPromise ||= db.runTransaction(async tx => {
    const ref = db.doc('serverConfig/unsubscribe');
    const snap = await tx.get(ref);
    if (snap.exists && snap.get('key')) return snap.get('key');
    const key = randomBytes(32).toString('base64url');
    tx.set(ref, { key, createdAt: FieldValue.serverTimestamp() });
    return key;
  }).catch(err => { keyPromise = null; throw err; });
  return keyPromise;
}

export async function unsubscribeToken(email) {
  return createHmac('sha256', await signingKey()).update(`unsubscribe:${customerId(email)}`).digest('base64url').slice(0, 32);
}

async function validToken(email, token) {
  if (typeof token !== 'string' || token.length !== 32) return false;
  const want = Buffer.from(await unsubscribeToken(email));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The person's unsubscribe page link. */
export async function unsubscribeUrl(email) {
  return `${brandUrl()}/unsubscribe?e=${encodeURIComponent(customerId(email))}&t=${await unsubscribeToken(email)}`;
}

/** Takes them off the mailing list (or back on, with resubscribe). */
export async function setSubscribed(email, subscribed, via) {
  const id = customerId(email);
  const signups = await db.collection('signups').where('email', '==', id).get();
  const batch = db.batch();
  batch.set(db.collection('customers').doc(id), {
    email: id,
    unsubscribed: subscribed ? FieldValue.delete() : { at: FieldValue.serverTimestamp(), via },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  if (!subscribed) signups.docs.forEach(d => batch.update(d.ref, { emailConsent: false }));
  await batch.commit();
}

export async function isUnsubscribed(email) {
  const snap = await db.collection('customers').doc(customerId(email)).get();
  return snap.exists && !!snap.get('unsubscribed');
}

export function unsubscribeRoutes() {
  const router = express.Router();
  // The unsubscribe page posts here once the person confirms.
  router.post('/api/unsubscribe', express.json({ limit: '2kb' }), async (req, res) => {
    const email = customerId(req.body && req.body.email);
    if (!email || !(await validToken(email, req.body.token).catch(() => false))) {
      return res.status(400).json({ error: 'That unsubscribe link isn’t valid. Use the link from your latest email, or contact us.' });
    }
    try {
      const resubscribe = req.body.resubscribe === true;
      await setSubscribed(email, resubscribe, 'link');
      res.json({ ok: true, subscribed: resubscribe });
    } catch (err) {
      console.error('unsubscribe failed', err);
      res.status(500).json({ error: 'Something went wrong. Please try again in a moment.' });
    }
  });
  // One-click unsubscribe from the mail app (RFC 8058): a POST to the link itself.
  router.post('/unsubscribe', express.urlencoded({ extended: false, limit: '2kb' }), async (req, res) => {
    const email = customerId(req.query.e);
    if (!email || !(await validToken(email, req.query.t).catch(() => false))) return res.status(400).type('text').send('Invalid link');
    try {
      await setSubscribed(email, false, 'one-click');
      res.type('text').send('Unsubscribed');
    } catch (err) {
      console.error('unsubscribe failed', err);
      res.status(500).type('text').send('Server error');
    }
  });
  return router;
}
