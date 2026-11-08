// GET /api/admin/status  System Status card in Settings: checks each service the
// site depends on, from the server, so the Stripe and Resend keys never reach
// the browser. Every check runs at once with its own time limit, and the reply
// only carries a state, a short note and how long it took.
//
// state: 'ok' (working), 'warn' (working, with something to look at),
//        'down' (failing) or 'off' (not set up here, e.g. no key locally).
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { db, stripe, resend, getSiteMode, isShopOpen } from './services.js';

const TIMEOUT_MS = 8000;

class Warn extends Error {}
class Off extends Error {}

function withTimeout(promise, ms = TIMEOUT_MS) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => { t = setTimeout(() => reject(new Error(`No answer after ${ms / 1000}s`)), ms); }),
  ]).finally(() => clearTimeout(t));
}

/** Runs one check and times it. The check returns its note, or throws Warn / Off / an error. */
async function run(id, name, group, check) {
  const start = Date.now();
  try {
    const detail = await withTimeout(check());
    return { id, name, group, state: 'ok', detail: detail || 'Working', ms: Date.now() - start };
  } catch (err) {
    const state = err instanceof Warn ? 'warn' : err instanceof Off ? 'off' : 'down';
    const message = String((err && err.message) || err).replace(/(sk|rk|re|whsec)_[A-Za-z0-9_]+/g, '[key]').slice(0, 200);
    return { id, name, group, state, detail: message, ms: Date.now() - start };
  }
}

const siteUrl = () => (process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');

/** Fetches a public page of the live site the way a visitor would. */
async function page(path, mode) {
  const base = siteUrl();
  if (!base) throw new Off('PUBLIC_SITE_URL is not set on this server');
  const res = await fetch(base + path, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'AXIA-status-check' } });
  await res.arrayBuffer().catch(() => null);
  if (res.status === 503 && mode !== 'production') throw new Warn(`Up, showing the ${mode} page (Site mode is ${mode})`);
  if (!res.ok) throw new Error(`${base.replace(/^https?:\/\//, '')}${path} answered ${res.status}`);
  return `${base.replace(/^https?:\/\//, '')}${path} answered ${res.status}`;
}

async function stripeCheck() {
  if (!stripe) throw new Off('No STRIPE_SECRET_KEY on this server');
  const key = (process.env.STRIPE_SECRET_KEY || '').trim();
  const live = /^(sk|rk)_live_/.test(key);
  const account = await stripe.accounts.retrieve();
  if (!account.charges_enabled) throw new Warn(`Key works, but the Stripe account can’t take payments yet`);
  if (!(process.env.STRIPE_WEBHOOK_SECRET || '').trim()) throw new Warn(`${live ? 'Live' : 'Test'} key works, but no webhook secret is set, so paid orders won’t be saved`);
  return `${live ? 'Live' : 'Test'} key works · ${account.settings?.dashboard?.display_name || account.business_profile?.name || account.id}`;
}

async function resendCheck() {
  if (!resend) throw new Off('No RESEND_API_KEY on this server');
  const from = process.env.ORDER_EMAIL_FROM || '';
  const domain = (from.match(/@([^>\s]+)/) || [])[1] || '';
  const r = await resend.domains.list();
  if (r.error) {
    // A send-only key can't list domains, but answering at all proves it's a real key.
    if (/restricted/i.test(r.error.name || '') || /restricted|only send/i.test(r.error.message || '')) {
      return `Send-only key works${domain ? ` · sends from ${domain}` : ''}`;
    }
    throw new Error(r.error.message || r.error.name || 'Resend refused the key');
  }
  const domains = (r.data && (r.data.data || r.data)) || [];
  if (!domain) throw new Warn('Key works, but ORDER_EMAIL_FROM is not set, so emails can’t be sent');
  const d = Array.isArray(domains) ? domains.find(x => x.name === domain) : null;
  if (!d) throw new Warn(`Key works, but ${domain} isn’t added in Resend`);
  if (d.status !== 'verified') throw new Warn(`Key works, but ${domain} is ${d.status} in Resend, not verified`);
  return `Key works · ${domain} verified`;
}

async function firestoreCheck() {
  await db.collection('site').doc('shop').get();
  return 'Read the shop settings';
}

async function authCheck() {
  await getAuth().listUsers(1);
  return 'Listed accounts';
}

async function storageCheck() {
  const name = process.env.STORAGE_BUCKET || 'axia-jewellery.firebasestorage.app';
  const [exists] = await getStorage().bucket(name).exists();
  if (!exists) throw new Error(`Bucket ${name} not found`);
  return `Bucket ${name}`;
}

export async function systemStatus() {
  // Site mode and the shop switch decide what the page checks should expect.
  const [mode, open] = await Promise.all([getSiteMode().catch(() => 'production'), isShopOpen().catch(() => null)]);
  const checks = await Promise.all([
    run('home', 'AXIA homepage', 'Website', () => page('/', mode)),
    run('shop', 'AXIA shop', 'Website', async () => {
      const note = await page('/shop', mode);
      if (open === false) throw new Warn(`Up, but the shop is closed (checkout is off)`);
      return note;
    }),
    run('portal', 'Customer portal', 'Website', () => page('/portal', 'production')),
    run('stripe', 'Stripe', 'Payments & email', stripeCheck),
    run('resend', 'Resend', 'Payments & email', resendCheck),
    run('firestore', 'Firestore', 'Firebase', firestoreCheck),
    run('auth', 'Authentication', 'Firebase', authCheck),
    run('storage', 'Storage', 'Firebase', storageCheck),
    run('server', 'App Hosting server', 'Firebase', async () => {
      const up = Math.round(process.uptime());
      const since = up < 120 ? `${up}s` : up < 7200 ? `${Math.round(up / 60)} min` : `${Math.round(up / 3600)} h`;
      return `Answering · up ${since}${process.env.K_REVISION ? ` · ${process.env.K_REVISION}` : ''}`;
    }),
  ]);
  return { checkedAt: Date.now(), siteMode: mode, checks };
}
