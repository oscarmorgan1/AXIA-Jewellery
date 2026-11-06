// Email two-factor for the admin portal.
//
// After signing in with a password or Google, an admin must enter a 6-digit
// code emailed to their account address before the portal (and the data) opens.
//
//   POST /api/auth/code/send    emails a code for this sign-in
//   POST /api/auth/code/verify  checks it and marks this sign-in as verified
//
// "This sign-in" is the ID token's `auth_time`: it is set when the user signs
// in and stays the same across token refreshes, so a code covers one sign-in
// on one device until they log off. Verifying adds that auth_time to the
// user's `mfa` custom claim (the last few, so a laptop and a phone can both be
// signed in). The Firestore and Storage rules and the admin API only accept a
// token whose auth_time is in its own `mfa` list (see isVerifiedAdmin below),
// so a stolen password alone can't read or change anything.
import express from 'express';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, resend } from './services.js';
import { signInCodeEmail } from './email.js';

const CODE_TTL_MS = 10 * 60 * 1000; // a code works for 10 minutes
const RESEND_AFTER_MS = 45 * 1000;  // wait before another code can be sent
const MAX_SENDS_PER_HOUR = 6;
const MAX_ATTEMPTS = 5;             // wrong guesses before a code is thrown away
const KEEP_SIGN_INS = 5;            // verified sign-ins kept in the claim

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

/** True when a decoded ID token belongs to an admin who has entered their emailed code for this sign-in. */
export function isVerifiedAdmin(token) {
  return token.admin === true && Array.isArray(token.mfa) && token.mfa.includes(token.auth_time);
}

async function adminToken(req) {
  const raw = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!raw) throw new HttpError(401, 'Sign in again');
  // checkRevoked so a revoked session or disabled account can't still request
  // or verify a sign-in code (matches requireAdmin in admin.js).
  const token = await getAuth().verifyIdToken(raw, true).catch(() => { throw new HttpError(401, 'Sign in again'); });
  if (token.admin !== true) throw new HttpError(403, 'Not an admin');
  return token;
}

const hash = (uid, authTime, code) => createHash('sha256').update(`${uid}:${authTime}:${code}`).digest();
const mask = email => email.replace(/^(.)(.*)(@.*)$/, (_, a, b, d) => a + '•'.repeat(Math.min(Math.max(b.length, 1), 6)) + d);
// Running against the emulators with no Resend key: codes go to the server log instead.
const logOnly = () => !!process.env.FIRESTORE_EMULATOR_HOST && !(resend && process.env.ORDER_EMAIL_FROM);

async function send(req) {
  const token = await adminToken(req);
  const user = await getAuth().getUser(token.uid);
  if (!user.email) throw new HttpError(400, 'This account has no email address to send a code to');
  if (isVerifiedAdmin(token)) return { verified: true };

  const ref = db.collection('adminSignInCodes').doc(token.uid);
  const now = Date.now();
  const prev = (await ref.get()).data();
  const sends = ((prev && prev.sends) || []).filter(t => now - t < 60 * 60 * 1000);
  const last = sends.length ? sends[sends.length - 1] : 0;
  // A code for this same sign-in went out a moment ago (a reload, a double
  // click): don't send another, just say when one can be.
  if (prev && prev.authTime === token.auth_time && now - last < RESEND_AFTER_MS) {
    return { sent: false, email: mask(user.email), retryIn: Math.ceil((RESEND_AFTER_MS - (now - last)) / 1000), ...(logOnly() ? { local: true } : {}) };
  }
  if (sends.length >= MAX_SENDS_PER_HOUR) throw new HttpError(429, 'Too many codes sent. Try again in an hour.');

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await ref.set({
    hash: hash(token.uid, token.auth_time, code).toString('hex'),
    authTime: token.auth_time,
    attempts: 0,
    expiresAt: Timestamp.fromMillis(now + CODE_TTL_MS),
    sends: [...sends, now],
    updatedAt: FieldValue.serverTimestamp(),
  });

  const from = process.env.ORDER_EMAIL_FROM;
  if (logOnly()) {
    console.log(`2fa: sign-in code for ${user.email} is ${code} (no Resend key, emulator only)`);
  } else if (resend && from) {
    const mail = signInCodeEmail({ code, minutes: CODE_TTL_MS / 60000, ip: req.get('x-fah-client-ip') || '', agent: req.get('user-agent') || '' });
    const { error } = await resend.emails.send({ from, to: user.email, ...mail });
    if (error) {
      await ref.delete();
      throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
    }
  } else {
    await ref.delete();
    throw new HttpError(503, 'Email isn’t set up (RESEND_API_KEY or ORDER_EMAIL_FROM is missing), so no code could be sent');
  }
  return { sent: true, email: mask(user.email), retryIn: Math.ceil(RESEND_AFTER_MS / 1000), ...(logOnly() ? { local: true } : {}) };
}

async function verify(req) {
  const token = await adminToken(req);
  if (isVerifiedAdmin(token)) return { verified: true };
  const code = String(req.body && req.body.code || '').replace(/\D/g, '');
  if (code.length !== 6) throw new HttpError(400, 'Enter the 6-digit code from the email');

  const ref = db.collection('adminSignInCodes').doc(token.uid);
  const result = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const c = snap.data();
    if (!c || c.authTime !== token.auth_time) return 'none';
    if (c.expiresAt.toMillis() < Date.now()) { tx.delete(ref); return 'expired'; }
    const ok = timingSafeEqual(Buffer.from(c.hash, 'hex'), hash(token.uid, token.auth_time, code));
    if (ok) { tx.update(ref, { hash: FieldValue.delete(), authTime: FieldValue.delete(), usedAt: FieldValue.serverTimestamp() }); return 'ok'; }
    const attempts = (c.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) { tx.update(ref, { hash: FieldValue.delete(), authTime: FieldValue.delete(), attempts }); return 'locked'; }
    tx.update(ref, { attempts });
    return `wrong:${MAX_ATTEMPTS - attempts}`;
  });

  if (result === 'none') throw new HttpError(400, 'That code has been used or replaced. Send a new one.');
  if (result === 'expired') throw new HttpError(400, 'That code has expired. Send a new one.');
  if (result === 'locked') throw new HttpError(400, 'Too many wrong codes. Send a new one.');
  if (result.startsWith('wrong:')) {
    const left = Number(result.slice(6));
    throw new HttpError(400, `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
  }

  const user = await getAuth().getUser(token.uid);
  const claims = user.customClaims || {};
  const mfa = (Array.isArray(claims.mfa) ? claims.mfa : []).filter(t => t !== token.auth_time).slice(-(KEEP_SIGN_INS - 1));
  await getAuth().setCustomUserClaims(token.uid, { ...claims, mfa: [...mfa, token.auth_time] });
  return { verified: true };
}

const handle = fn => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(`2fa: ${req.path} failed`, err);
    res.status(500).json({ error: 'Couldn’t send or check the code. Try again in a moment.' });
  }
};

export function twoFactorRoutes() {
  const router = express.Router();
  router.use('/api/auth/code', express.json({ limit: '2kb' }));
  router.post('/api/auth/code/send', handle(send));
  router.post('/api/auth/code/verify', handle(verify));
  return router;
}
