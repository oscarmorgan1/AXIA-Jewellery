// POST /api/message  The support page's contact form, read in the portal Inbox.
// POST /api/visit    One anonymous unique-visitor entry per browser per day.
//
// Both used to be written straight to Firestore from the browser. Going through
// the server means each visitor is rate limited, and the Firestore rules can
// stay closed to the public (see firestore.rules).
import express from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db, resend } from './services.js';
import { inquiryAlertEmail } from './email.js';
import { rateLimit, clientIp } from './limit.js';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TOPICS = ['Inquiry', 'Support'];
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// The team address that hears about each new inquiry. Server config only
// (apphosting.yaml), never sent to the browser.
const alertTo = () => (process.env.INQUIRY_ALERT_TO || '').split(',').map(s => s.trim()).filter(Boolean);

/**
 * Emails the team about a saved inquiry (or a new reply in a portal conversation,
 * with its own `key`). Never fails the form: the Inbox has it either way.
 */
export async function alertTeam(doc, id, key = `inquiry-alert/${id}`) {
  const to = alertTo();
  const from = process.env.ORDER_EMAIL_FROM;
  if (!to.length) return;
  if (!resend || !from) return console.warn('message: RESEND_API_KEY or ORDER_EMAIL_FROM not set, no inquiry alert sent');
  const { error } = await resend.emails.send({ from, to, replyTo: doc.email, ...inquiryAlertEmail(doc) }, { idempotencyKey: key });
  if (error) throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
}

const tooManyMessages = rateLimit({ windowMs: 10 * 60 * 1000, max: 5 });
const tooManyVisits = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });

/** Today's date in Sydney, YYYY-MM-DD, the day the portal groups visits by. */
export const sydneyDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

export function publicFormRoutes() {
  const router = express.Router();

  router.post('/api/message', express.json({ limit: '16kb' }), async (req, res) => {
    const b = req.body || {};
    const doc = {
      name: str(b.name, 100),
      email: str(b.email, 200).toLowerCase(),
      topic: str(b.topic, 40) || 'Inquiry',
      order: str(b.order, 60),
      message: str(b.message, 5000),
    };
    if (!doc.name) return res.status(400).json({ error: 'Please add your name.' });
    if (!EMAIL.test(doc.email)) return res.status(400).json({ error: 'Please enter a valid email.' });
    if (doc.message.length < 4) return res.status(400).json({ error: 'Please add a short message.' });
    if (!TOPICS.includes(doc.topic)) doc.topic = 'Inquiry';
    if (tooManyMessages(clientIp(req))) return res.status(429).json({ error: 'Too many messages from here. Please try again later, or email support@axiajewellery.com.' });
    try {
      const ref = await db.collection('messages').add({ ...doc, status: 'new', createdAt: FieldValue.serverTimestamp() });
      res.json({ ok: true });
      alertTeam(doc, ref.id).catch(err => console.error('message: inquiry alert failed', ref.id, err));
    } catch (err) {
      console.error('message: could not save', err);
      res.status(500).json({ error: 'Something stopped that from sending. Please try again in a moment.' });
    }
  });

  router.post('/api/visit', express.json({ limit: '2kb' }), async (req, res) => {
    const b = req.body || {};
    const vid = str(b.vid, 32);
    if (!/^[A-Za-z0-9]{12,32}$/.test(vid)) return res.status(400).json({ error: 'Bad request' });
    if (tooManyVisits(clientIp(req))) return res.status(204).end(); // quietly ignore scripted repeats
    const day = sydneyDay();
    const device = ['mobile', 'tablet', 'desktop'].includes(b.device) ? b.device : 'desktop';
    try {
      await db.collection('visits').doc(`${day}_${vid}`).create({
        day, vid, page: str(b.page, 200) || '/', ref: str(b.ref, 100), device, createdAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      if (err && err.code !== 6) console.error('visit: could not save', err); // 6 = already counted today
    }
    res.status(204).end();
  });

  return router;
}
