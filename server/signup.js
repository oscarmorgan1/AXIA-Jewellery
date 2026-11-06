// POST /api/signup  Waitlist sign-ups from the landing and First Drop pages.
// Saves the sign-up (same fields and limits as the Firestore rules) and sends a
// one-time welcome email with the first-order code, logged with its Resend ID
// on the sign-up and on the customer record.
import express from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './services.js';
import { welcomeEmail, sendEmail } from './email.js';
import { emailEntry, push, customerId } from './orders.js';
import { isUnsubscribed, setSubscribed } from './unsubscribe.js';
import { rateLimit, clientIp } from './limit.js';

const EMAIL = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;
const SOURCES = ['landing', 'first-drop', 'other'];
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// A light per-visitor limit so the form can't be used to spam inboxes, plus an
// overall cap on welcome emails per instance as a backstop if the IP is ever
// misread: past it, sign-ups still save but the email waits for a re-sign-up.
const tooMany = rateLimit({ windowMs: 10 * 60 * 1000, max: 8 });
const tooManyWelcomes = rateLimit({ windowMs: 60 * 60 * 1000, max: 300, maxKeys: 1 });

export function welcomeCode() {
  return {
    code: (process.env.WELCOME_CODE || 'FREE15').trim().toUpperCase(),
    percentOff: Number(process.env.WELCOME_PERCENT_OFF) || 15,
  };
}

async function sendWelcome(email, name, signupRef, siteUrl) {
  const ref = db.collection('customers').doc(email);
  const snap = await ref.get();
  if (snap.exists && snap.get('welcome.status') === 'sent') return null; // once per person
  const { code, percentOff } = welcomeCode();
  const mail = welcomeEmail({ name, code, percentOff, siteUrl });
  const sent = await sendEmail({ to: email, ...mail, idempotencyKey: `welcome/${email}` });
  const entry = { ...emailEntry('welcome', email, mail.subject, sent), code };
  await Promise.all([
    signupRef.update({ welcomeEmail: entry }),
    ref.set({ email, welcome: entry, ...(sent ? { emails: push(entry) } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
  ]);
  return entry;
}

export function signupRoutes() {
  const router = express.Router();
  router.post('/api/signup', express.json({ limit: '8kb' }), async (req, res) => {
    const b = req.body || {};
    const email = customerId(str(b.email, 200));
    const firstName = str(b.firstName, 80);
    if (!firstName) return res.status(400).json({ error: 'Please add your first name.' });
    if (!EMAIL.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
    if (tooMany(clientIp(req))) return res.status(429).json({ error: 'Too many sign-ups from here. Please try again later.' });
    const doc = {
      firstName, email,
      mobile: str(b.mobile, 30), instagram: str(b.instagram, 60),
      productId: str(b.productId, 120), productName: str(b.productName, 160), size: str(b.size, 40),
      emailConsent: b.emailConsent === true, smsConsent: b.smsConsent === true,
      source: SOURCES.includes(b.source) ? b.source : 'other', page: str(b.page, 200),
      createdAt: FieldValue.serverTimestamp(),
    };
    try {
      const ref = await db.collection('signups').add(doc);
      // Signing up again and ticking the email box puts someone who unsubscribed back on the list.
      if (doc.emailConsent) {
        await (async () => { if (await isUnsubscribed(email)) await setSubscribed(email, true, 'signup'); })()
          .catch(err => console.error('signup: could not resubscribe', err));
      }
      // Sent before replying (the server may pause once a response is out), but a
      // failed email never fails the sign-up itself.
      const host = req.get('x-forwarded-host') || req.get('host');
      const siteUrl = (process.env.PUBLIC_SITE_URL || `${req.protocol}://${host}`).replace(/\/$/, '');
      if (tooManyWelcomes('all')) console.error('signup: hourly welcome email cap reached, not sending to', email);
      else await sendWelcome(email, firstName, ref, siteUrl).catch(err => console.error('signup: welcome email failed', err));
      res.json({ ok: true });
    } catch (err) {
      console.error('signup: could not save', err);
      res.status(500).json({ error: 'Something stopped that from sending. Please try again in a moment.' });
    }
  });
  return router;
}
