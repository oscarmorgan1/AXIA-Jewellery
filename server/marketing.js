// Admin > Marketing: emails to the waitlist, sent through Resend, with their
// results (delivered, opened, clicked, bounced, complaints).
//
// Who gets them (compliance): only people who ticked "email me" on a waitlist
// sign-up, plus (for "Everyone subscribed") portal accounts that turned on
// news and offers. Anyone whose customer record is marked `unsubscribed` is
// left out when the list is made, and checked again just before each batch
// goes, so an unsubscribe mid-send still counts. Every email carries their own
// signed unsubscribe link and the one-click List-Unsubscribe header, and a
// spam complaint unsubscribes them automatically.
//
// Firestore (server only; the rules' catch-all denies the browser):
//   campaigns/{id}                       content, status, counts
//   campaigns/{id}/recipients/{email}    who, Resend id, what happened
//   campaignEmails/{resendId}            Resend id → campaign + email, for the webhook
//   serverConfig/resendWebhook           the webhook's id and signing secret
//   resendEvents/{webhookId}             events already counted (Resend retries)
//
// Sending runs in steps the portal drives (POST .../send, then .../send/next
// until done), so a big list never outlives one request and a closed tab just
// pauses it. Each Resend batch has an idempotency key, so a retried step never
// emails anyone twice.
import { createHash } from 'node:crypto';
import express from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, resend } from './services.js';
import { brandUrl } from './email.js';
import { marketingEmail, UNSUBSCRIBE_TOKEN } from './marketing-email.js';
import { unsubscribeUrl, setSubscribed } from './unsubscribe.js';
import { customerId, emailEntry, push } from './orders.js';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const millis = t => (t && t.toMillis ? t.toMillis() : null);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EMAIL = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;
const BATCH = 100;            // Resend's batch limit
const BATCHES_PER_STEP = 5;   // 500 emails per request, about 4 seconds
const AUDIENCES = ['waitlist', 'everyone'];

const from = () => (process.env.MARKETING_EMAIL_FROM || process.env.ORDER_EMAIL_FROM || '').trim();
const siteUrl = () => (process.env.PUBLIC_SITE_URL || brandUrl()).replace(/\/$/, '');

// ---- Templates --------------------------------------------------------------

const SYDNEY = { timeZone: 'Australia/Sydney' };
function dropWhen(target) {
  const d = new Date(target);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-AU', { ...SYDNEY, weekday: 'long', day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('en-AU', { ...SYDNEY, hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(/\s/g, '').toLowerCase();
  return `${day} · ${time} Sydney time`;
}

export const TEMPLATES = {
  'drop-48h': {
    name: 'Drop is live in 48 hours',
    blurb: 'Countdown teaser for the waitlist, two days out.',
    content: {
      subject: 'The first drop goes live in 48 hours',
      preheader: 'Waitlist gets first access. Set a reminder.',
      eyebrow: 'The first drop',
      heroImage: 'assets/img/email/drop-hero.jpg',
      heroAlt: 'AXIA Moonrock Cuban chain',
      stat: { value: '48', label: 'Hours to go', note: '' },
      heading: 'Two days. Then it’s yours.',
      body: 'Hi {{first_name}},\n\nThe first AXIA drop goes live in 48 hours, and you’re on the list, so you’re hearing it first.\n\nEvery piece is hand-set in 925 sterling silver with VVS D-colour moissanite that passes a diamond tester. Quantities in the first run are small, and once a piece sells out it’s made to order.',
      ctaLabel: 'Preview the drop',
      ctaUrl: '/first-drop',
      productsTitle: 'In the first drop',
      footnote: 'Your first-order code from your welcome email works on drop day.',
      audience: 'waitlist',
    },
    products: ['the-titan', 'the-emperor', 'the-requiem', 'cross-set'],
  },
  'store-live': {
    name: 'Store is live',
    blurb: 'Launch-day announcement: the shop is open.',
    content: {
      subject: 'AXIA is live. The store is open.',
      preheader: 'The first drop is here. Shop before it sells out.',
      eyebrow: 'Now open',
      heroImage: 'assets/img/email/store-hero.jpg',
      heroAlt: 'AXIA Micro Pavé Cuban chain',
      stat: null,
      heading: 'The store is live',
      body: 'Hi {{first_name}},\n\nThe wait’s over. The AXIA store is open and the first drop is ready to ship.\n\nHand-set moissanite in 925 sterling silver, a GRA certificate with every piece, a lifetime warranty and free 30-day size exchanges. Engrave it, stack it, make it yours.',
      ctaLabel: 'Shop now',
      ctaUrl: '/shop',
      productsTitle: 'Start here',
      footnote: 'First run quantities are limited. Pieces that sell out move to made to order.',
      audience: 'waitlist',
    },
    products: ['the-titan', 'square-halo-tennis-bracelet', 'tennis-chain-4mm', 'cross-pendant'],
  },
  blank: {
    name: 'Blank',
    blurb: 'Start from the AXIA layout with your own words.',
    content: {
      subject: '', preheader: '', eyebrow: 'AXIA', heroImage: 'assets/img/email/case-hero.jpg', heroAlt: 'The AXIA travel case', stat: null,
      heading: '', body: 'Hi {{first_name}},\n\n', ctaLabel: 'Shop AXIA', ctaUrl: '/shop', productsTitle: 'The pieces', footnote: '', audience: 'waitlist',
    },
    products: [],
  },
};

// ---- Content -----------------------------------------------------------------

function cleanContent(b = {}) {
  const s = b.stat && typeof b.stat === 'object' ? b.stat : null;
  const image = v => { const x = str(v, 600); return /^https:\/\//.test(x) || /^assets\/[\w./-]+$/.test(x) ? x : ''; };
  return {
    subject: str(b.subject, 150), preheader: str(b.preheader, 200), eyebrow: str(b.eyebrow, 60),
    heroImage: image(b.heroImage), heroAlt: str(b.heroAlt, 150),
    stat: s && str(s.value, 12) ? { value: str(s.value, 12), label: str(s.label, 40), note: str(s.note, 120) } : null,
    heading: str(b.heading, 120), body: typeof b.body === 'string' ? b.body.trim().slice(0, 5000) : '',
    ctaLabel: str(b.ctaLabel, 40), ctaUrl: str(b.ctaUrl, 500), productsTitle: str(b.productsTitle, 60), footnote: str(b.footnote, 400),
    products: Array.isArray(b.products) ? [...new Set(b.products.map(p => str(p, 120)).filter(Boolean))].slice(0, 6) : [],
    audience: AUDIENCES.includes(b.audience) ? b.audience : 'waitlist',
  };
}

/** The chosen products as the email shows them: name, first photo, from price. Archived ones drop out. */
async function productCards(ids) {
  if (!ids || !ids.length) return [];
  const snaps = await db.getAll(...ids.map(id => db.collection('products').doc(id)));
  return snaps.filter(s => s.exists && !s.get('archived')).map(s => {
    const p = s.data();
    const byColor = p.imagesByColor && Object.values(p.imagesByColor).find(l => Array.isArray(l) && l.length);
    const prices = (p.variants || []).map(v => v.priceAUD).filter(n => n > 0);
    return { id: s.id, name: p.name || s.id, image: (p.images && p.images[0]) || (byColor && byColor[0]) || '', priceAUD: p.fromPriceAUD || (prices.length ? Math.min(...prices) : 0) };
  });
}

async function render(content, firstName) {
  return marketingEmail(content, { products: await productCards(content.products), siteUrl: siteUrl(), firstName });
}

// ---- Audience ------------------------------------------------------------------

/**
 * Who a campaign goes to right now: one entry per email, with a first name.
 * Returns the list plus how many were left out and why, for the portal.
 */
export async function buildAudience(audience = 'waitlist') {
  const [signups, customers, accounts] = await Promise.all([
    db.collection('signups').select('email', 'firstName', 'emailConsent').get(),
    db.collection('customers').where('unsubscribed', '!=', null).select().get(),
    audience === 'everyone' ? db.collection('accounts').where('marketing.email', '==', true).select('email', 'name', 'firstName').get() : null,
  ]);
  const unsubscribed = new Set(customers.docs.map(d => d.id));
  const people = new Map();
  const noConsent = new Set();
  const consider = (rawEmail, firstName, consent) => {
    const email = customerId(rawEmail);
    if (!EMAIL.test(email)) return;
    if (!consent) { if (!people.has(email)) noConsent.add(email); return; }
    noConsent.delete(email);
    const prev = people.get(email);
    people.set(email, { email, firstName: (prev && prev.firstName) || String(firstName || '').trim().split(/\s+/)[0].slice(0, 40) });
  };
  for (const d of signups.docs) consider(d.get('email'), d.get('firstName'), d.get('emailConsent') === true);
  if (accounts) for (const d of accounts.docs) consider(d.get('email'), d.get('firstName') || d.get('name'), true);
  // Unsubscribing also turns off consent on their sign-ups, so they're counted as unsubscribed, not "didn't opt in".
  let skipped = 0;
  for (const e of [...people.keys()]) if (unsubscribed.has(e)) { people.delete(e); skipped++; }
  for (const e of [...noConsent]) if (unsubscribed.has(e)) { noConsent.delete(e); skipped++; }
  return { list: [...people.values()], excluded: { unsubscribed: skipped, noConsent: noConsent.size } };
}

// ---- Campaign records --------------------------------------------------------

const STATS = ['recipients', 'sent', 'failed', 'skipped', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'opens', 'clicks'];
const blankStats = () => Object.fromEntries(STATS.map(k => [k, 0]));

function publicCampaign(d) {
  const v = d.data();
  return {
    id: d.id, name: v.name, template: v.template, status: v.status, content: v.content,
    stats: { ...blankStats(), ...(v.stats || {}) },
    links: Object.values(v.links || {}).sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 20),
    createdAt: millis(v.createdAt), updatedAt: millis(v.updatedAt), sendStartedAt: millis(v.sendStartedAt), sentAt: millis(v.sentAt),
    createdBy: v.createdBy || '', sentBy: v.sentBy || '', tests: (v.tests || []).map(t => ({ ...t, at: millis(t.at) })),
    lastError: v.lastError || '', syncedAt: millis(v.syncedAt),
  };
}

async function getCampaign(id) {
  const ref = db.collection('campaigns').doc(str(id, 100));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Email not found');
  return { ref, snap, data: snap.data() };
}

async function createCampaign(req) {
  const key = TEMPLATES[req.body.template] ? req.body.template : 'blank';
  const t = TEMPLATES[key];
  const content = cleanContent({ ...t.content, products: t.products });
  // The 48-hour teaser says when, from the countdown set under Website.
  if (key === 'drop-48h') {
    const cd = await db.collection('site').doc('countdown').get();
    const when = cd.exists && cd.get('target') ? dropWhen(cd.get('target')) : '';
    if (when && content.stat) content.stat.note = when;
  }
  // Templates name pieces that may have been renamed or archived: keep the ones that exist.
  content.products = (await productCards(content.products)).map(p => p.id);
  const ref = await db.collection('campaigns').add({
    name: t.name === 'Blank' ? 'Untitled email' : t.name, template: key, status: 'draft', content, stats: blankStats(),
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: req.admin.email || req.admin.uid,
  });
  return { id: ref.id };
}

async function saveCampaign(req) {
  const { ref, data } = await getCampaign(req.params.id);
  if (data.status !== 'draft') throw new HttpError(409, 'This email has been sent, so it can’t be changed. Duplicate it to send a new version.');
  await ref.update({ name: str(req.body.name, 80) || data.name, content: cleanContent(req.body.content), updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

async function duplicateCampaign(req) {
  const { data } = await getCampaign(req.params.id);
  const ref = await db.collection('campaigns').add({
    name: `${data.name} (copy)`.slice(0, 80), template: data.template, status: 'draft', content: data.content, stats: blankStats(),
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: req.admin.email || req.admin.uid,
  });
  return { id: ref.id };
}

async function deleteCampaign(req) {
  const { ref, data } = await getCampaign(req.params.id);
  if (data.status === 'sending') throw new HttpError(409, 'This email is still sending. Let it finish first.');
  // A sent one takes its results with it, and the webhook stops counting for it.
  const sends = await db.collection('campaignEmails').where('campaignId', '==', ref.id).select().get();
  for (let i = 0; i < sends.docs.length; i += 400) {
    const b = db.batch(); sends.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit();
  }
  await db.recursiveDelete(ref);
  return { ok: true };
}

async function listCampaigns() {
  const snap = await db.collection('campaigns').orderBy('createdAt', 'desc').limit(200).get();
  return snap.docs.map(publicCampaign);
}

async function campaignDetail(req) {
  const { ref, snap } = await getCampaign(req.params.id);
  const recipients = await ref.collection('recipients').limit(5000).get();
  return {
    ...publicCampaign(snap),
    recipients: recipients.docs.map(d => {
      const r = d.data();
      return {
        email: d.id, firstName: r.firstName || '', status: r.status, error: r.error || '', resendId: r.resendId || null,
        sentAt: millis(r.sentAt), deliveredAt: millis(r.deliveredAt), openedAt: millis(r.openedAt), clickedAt: millis(r.clickedAt),
        bouncedAt: millis(r.bouncedAt), complainedAt: millis(r.complainedAt), opens: r.opens || 0, clicks: r.clicks || 0,
      };
    }),
  };
}

// ---- Preview and test ----------------------------------------------------------

async function preview(req) {
  const content = cleanContent(req.body.content);
  const mail = await render(content, str(req.body.firstName, 40) || 'Alex');
  return { subject: mail.subject, html: mail.html.split(UNSUBSCRIBE_TOKEN).join(`${brandUrl()}/unsubscribe`) };
}

async function audienceSummary(req) {
  const { list, excluded } = await buildAudience(AUDIENCES.includes(req.query.audience) ? req.query.audience : 'waitlist');
  return { count: list.length, excluded, sample: list.slice(0, 5).map(p => p.email) };
}

/** Sends one copy to the admin (or an address they type), marked as a test. Nobody else gets anything. */
async function sendTest(req) {
  if (!resend || !from()) throw new HttpError(503, 'Email isn’t set up (RESEND_API_KEY or ORDER_EMAIL_FROM is missing), so nothing was sent');
  const { ref, data } = await getCampaign(req.params.id);
  const to = customerId(str(req.body.to, 200) || req.admin.email);
  if (!EMAIL.test(to)) throw new HttpError(400, 'That email address doesn’t look right');
  const content = data.status === 'draft' && req.body.content ? cleanContent(req.body.content) : data.content;
  const mail = await render(content, str(req.body.firstName, 40));
  const unsub = await unsubscribeUrl(to);
  const { data: sent, error } = await resend.emails.send({
    from: from(), to, subject: `[Test] ${mail.subject}`,
    html: mail.html.split(UNSUBSCRIBE_TOKEN).join(unsub), text: mail.text.split(UNSUBSCRIBE_TOKEN).join(unsub),
    headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    ...(process.env.ORDER_EMAIL_REPLY_TO ? { replyTo: process.env.ORDER_EMAIL_REPLY_TO } : {}),
    tags: [{ name: 'kind', value: 'marketing_test' }],
  });
  if (error) throw new HttpError(502, `Resend: ${error.message || JSON.stringify(error)}`);
  await ref.update({ tests: FieldValue.arrayUnion({ to, at: Timestamp.now(), resendId: (sent && sent.id) || null, by: req.admin.email || req.admin.uid }) });
  return { to, resendId: sent && sent.id };
}

// ---- Sending -------------------------------------------------------------------

/** Takes the campaign's send lock for one step, so two tabs can't send the same batch. */
async function lock(ref) {
  return db.runTransaction(async tx => {
    const s = await tx.get(ref);
    const until = millis(s.get('lockUntil')) || 0;
    if (until > Date.now()) return false;
    tx.update(ref, { lockUntil: Timestamp.fromMillis(Date.now() + 90_000) });
    return true;
  });
}

/** Freezes the list: one recipient record per person, queued. */
async function startSend(req) {
  if (!resend || !from()) throw new HttpError(503, 'Email isn’t set up (RESEND_API_KEY or ORDER_EMAIL_FROM is missing), so nothing was sent');
  const { ref, data } = await getCampaign(req.params.id);
  if (data.status === 'sending') return sendStep(req);
  if (data.status !== 'draft') throw new HttpError(409, 'This email has already been sent');
  const c = data.content || {};
  if (!c.subject || !c.heading) throw new HttpError(400, 'Add a subject and a heading first');
  if (!(await lock(ref))) throw new HttpError(409, 'This email is already being sent from another tab');
  const { list } = await buildAudience(c.audience);
  if (!list.length) { await ref.update({ lockUntil: null }); throw new HttpError(400, 'Nobody on this list can be emailed yet'); }
  const expected = Number(req.body.expected);
  if (expected > 0 && Math.abs(expected - list.length) > Math.max(5, expected * 0.05)) {
    await ref.update({ lockUntil: null });
    throw new HttpError(409, `The list changed to ${list.length} people since you checked. Review it again before sending.`);
  }
  for (let i = 0; i < list.length; i += 400) {
    const b = db.batch();
    for (const p of list.slice(i, i + 400)) b.set(ref.collection('recipients').doc(p.email), { firstName: p.firstName, status: 'queued' });
    await b.commit();
  }
  await ref.update({
    status: 'sending', 'stats.recipients': list.length, sendStartedAt: FieldValue.serverTimestamp(), sentBy: req.admin.email || req.admin.uid,
    lockUntil: null, lastError: '', updatedAt: FieldValue.serverTimestamp(),
  });
  return sendStep(req);
}

/** Sends the next few batches. The portal keeps calling until `done`. */
async function sendStep(req) {
  if (!resend || !from()) throw new HttpError(503, 'Email isn’t set up (RESEND_API_KEY or ORDER_EMAIL_FROM is missing)');
  const { ref, data } = await getCampaign(req.params.id);
  if (data.status !== 'sending') return { done: true, stats: { ...blankStats(), ...data.stats } };
  if (!(await lock(ref))) return { done: false, busy: true, stats: { ...blankStats(), ...data.stats } };
  const content = data.content;
  const products = await productCards(content.products);
  let error = '';
  try {
    for (let n = 0; n < BATCHES_PER_STEP; n++) {
      const queued = await ref.collection('recipients').where('status', '==', 'queued').limit(BATCH).get();
      if (queued.empty) break;
      // Checked again now: anyone who unsubscribed since the list was made is skipped.
      const custs = await db.getAll(...queued.docs.map(d => db.collection('customers').doc(d.id)));
      const out = new Set(custs.filter(c => c.exists && c.get('unsubscribed')).map(c => c.id));
      const go = queued.docs.filter(d => !out.has(d.id));
      const b0 = db.batch();
      queued.docs.filter(d => out.has(d.id)).forEach(d => b0.update(d.ref, { status: 'skipped', error: 'Unsubscribed' }));
      if (out.size) { b0.update(ref, { 'stats.skipped': FieldValue.increment(out.size) }); await b0.commit(); }
      if (!go.length) continue;

      const emails = await Promise.all(go.map(async d => {
        const mail = marketingEmail(content, { products, siteUrl: siteUrl(), firstName: d.get('firstName') });
        const unsub = await unsubscribeUrl(d.id);
        return {
          from: from(), to: d.id, subject: mail.subject,
          html: mail.html.split(UNSUBSCRIBE_TOKEN).join(unsub), text: mail.text.split(UNSUBSCRIBE_TOKEN).join(unsub),
          headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          ...(process.env.ORDER_EMAIL_REPLY_TO ? { replyTo: process.env.ORDER_EMAIL_REPLY_TO } : {}),
          tags: [{ name: 'campaign', value: ref.id.replace(/[^\w-]/g, '_') }],
        };
      }));
      const key = `campaign/${ref.id}/${createHash('sha256').update(go.map(d => d.id).join(',')).digest('hex').slice(0, 32)}`;
      let res;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await resend.batch.send(emails, { idempotencyKey: key });
        if (!res.error || !/rate|429/i.test(`${res.error.name} ${res.error.statusCode}`)) break;
        await sleep(1200 * (attempt + 1));
      }
      if (res.error) {
        error = `Resend: ${res.error.message || JSON.stringify(res.error)}`;
        break;
      }
      const ids = (res.data && res.data.data) || [];
      const now = Timestamp.now();
      const b = db.batch();
      go.forEach((d, i) => {
        const id = ids[i] && ids[i].id;
        b.update(d.ref, { status: 'sent', resendId: id || null, sentAt: now });
        if (id) b.set(db.collection('campaignEmails').doc(id), { campaignId: ref.id, email: d.id, sentAt: now });
        // On their customer record too, so it shows in their activity.
        b.set(db.collection('customers').doc(d.id), {
          email: d.id, emails: push({ ...emailEntry('marketing', d.id, emails[i].subject, id ? { id } : null), campaignId: ref.id }),
        }, { merge: true });
      });
      b.update(ref, { 'stats.sent': FieldValue.increment(go.length), updatedAt: FieldValue.serverTimestamp() });
      await b.commit();
      await sleep(600); // Resend allows about 2 requests a second
    }
  } finally {
    const left = await ref.collection('recipients').where('status', '==', 'queued').limit(1).get();
    const done = left.empty;
    await ref.update({
      lockUntil: null, lastError: error,
      ...(done ? { status: 'sent', sentAt: FieldValue.serverTimestamp() } : {}),
    });
  }
  const after = (await ref.get()).data();
  if (error) throw new HttpError(502, `${error}. ${after.stats.sent || 0} sent so far; press Continue sending to carry on.`);
  return { done: after.status === 'sent', stats: { ...blankStats(), ...after.stats } };
}

// ---- Results: Resend webhook ---------------------------------------------------

const EVENT_FIELD = {
  'email.delivered': 'delivered', 'email.opened': 'opened', 'email.clicked': 'clicked',
  'email.bounced': 'bounced', 'email.complained': 'complained',
};
// Opening implies it arrived; clicking implies both (some mail apps block the open pixel).
const IMPLIES = { opened: ['delivered'], clicked: ['delivered', 'opened'] };

/** Records one thing that happened to one email. Unique counts go up once per person. */
async function recordEvent(resendId, kind, at, { link } = {}) {
  const map = await db.collection('campaignEmails').doc(resendId).get();
  if (!map.exists) return false; // an order email or a test: not a campaign
  const { campaignId, email } = map.data();
  const campaign = db.collection('campaigns').doc(campaignId);
  const rec = campaign.collection('recipients').doc(email);
  await db.runTransaction(async tx => {
    const r = await tx.get(rec);
    if (!r.exists) return;
    const upd = {}, inc = {};
    for (const f of [...(IMPLIES[kind] || []), kind]) {
      if (!r.get(`${f}At`)) { upd[`${f}At`] = at; inc[`stats.${f}`] = FieldValue.increment(1); }
    }
    if (kind === 'opened') { upd.opens = FieldValue.increment(1); inc['stats.opens'] = FieldValue.increment(1); }
    if (kind === 'clicked') {
      upd.clicks = FieldValue.increment(1); inc['stats.clicks'] = FieldValue.increment(1);
      if (link) {
        const h = createHash('sha1').update(link).digest('hex').slice(0, 12);
        inc[`links.${h}.url`] = link.slice(0, 500); inc[`links.${h}.clicks`] = FieldValue.increment(1);
      }
    }
    if (Object.keys(upd).length) tx.update(rec, upd);
    if (Object.keys(inc).length) tx.update(campaign, inc);
  });
  // A spam complaint means stop emailing them, same as the unsubscribe link.
  if (kind === 'complained') await setSubscribed(email, false, 'complaint').catch(err => console.error('marketing: could not unsubscribe after complaint', err));
  return true;
}

let secretCache = { value: null, at: 0 };
async function webhookSecret() {
  if (process.env.RESEND_WEBHOOK_SECRET) return process.env.RESEND_WEBHOOK_SECRET.trim();
  if (Date.now() - secretCache.at < 60_000) return secretCache.value;
  const snap = await db.collection('serverConfig').doc('resendWebhook').get();
  secretCache = { value: (snap.exists && snap.get('secret')) || null, at: Date.now() };
  return secretCache.value;
}

export function resendWebhookRoutes() {
  const router = express.Router();
  router.post('/api/resend/webhook', express.text({ type: '*/*', limit: '256kb' }), async (req, res) => {
    const secret = await webhookSecret().catch(() => null);
    if (!secret || !resend) return res.status(503).json({ error: 'Not set up' });
    let event;
    try {
      event = resend.webhooks.verify({
        payload: req.body,
        headers: { id: req.get('svix-id') || req.get('webhook-id'), timestamp: req.get('svix-timestamp') || req.get('webhook-timestamp'), signature: req.get('svix-signature') || req.get('webhook-signature') },
        webhookSecret: secret,
      });
    } catch {
      return res.status(400).json({ error: 'Bad signature' });
    }
    const kind = EVENT_FIELD[event && event.type];
    const id = event && event.data && event.data.email_id;
    if (!kind || !id) return res.json({ ok: true, ignored: true });
    try {
      // Resend retries until it gets a 2xx: count each event once.
      const eventId = str(req.get('svix-id') || req.get('webhook-id'), 100).replace(/\//g, '_');
      if (eventId) {
        try { await db.collection('resendEvents').doc(eventId).create({ at: Timestamp.now(), type: event.type }); }
        catch (err) { if (err && err.code === 6) return res.json({ ok: true, duplicate: true }); throw err; }
      }
      const at = Timestamp.fromDate(new Date(event.created_at || Date.now()));
      await recordEvent(id, kind, at, { link: event.data.click && event.data.click.link });
      res.json({ ok: true });
    } catch (err) {
      console.error('resend webhook failed', err);
      res.status(500).json({ error: 'Server error' });
    }
  });
  return router;
}

// ---- Results: catching up from Resend without the webhook ---------------------

const LAST_EVENT = { delivered: 'delivered', opened: 'opened', clicked: 'clicked', bounced: 'bounced', complained: 'complained' };

/**
 * Reads Resend's list of recent emails (100 a page, newest first) and records
 * the latest state of this campaign's ones. Works with no webhook set up,
 * though it only knows each email's latest event, not how many opens or clicks.
 */
async function syncFromResend(req) {
  if (!resend) throw new HttpError(503, 'Resend isn’t set up');
  const { ref, data } = await getCampaign(req.params.id);
  if (!['sending', 'sent'].includes(data.status)) throw new HttpError(400, 'This email hasn’t been sent yet');
  const started = (millis(data.sendStartedAt) || Date.now()) - 60_000;
  const recipients = await ref.collection('recipients').where('status', '==', 'sent').select('resendId', 'clickedAt', 'bouncedAt', 'complainedAt').get();
  const want = new Map(recipients.docs.filter(d => d.get('resendId') && !d.get('clickedAt') && !d.get('bouncedAt') && !d.get('complainedAt')).map(d => [d.get('resendId'), d]));
  let after, pages = 0, updated = 0;
  while (want.size && pages < 40) {
    const { data: page, error } = await resend.emails.list({ limit: 100, ...(after ? { after } : {}) });
    if (error) throw new HttpError(502, `Resend: ${error.message || JSON.stringify(error)}`);
    pages++;
    const items = (page && page.data) || [];
    for (const e of items) {
      const d = want.get(e.id);
      const kind = d && LAST_EVENT[e.last_event];
      if (kind) { await recordEvent(e.id, kind, Timestamp.now()); updated++; want.delete(e.id); }
    }
    const last = items[items.length - 1];
    if (!page || !page.has_more || !last || Date.parse(last.created_at) < started) break;
    after = last.id;
    await sleep(550);
  }
  await ref.update({ syncedAt: FieldValue.serverTimestamp() });
  return { updated, pages };
}

// ---- Tracking setup -------------------------------------------------------------

const WEBHOOK_EVENTS = ['email.delivered', 'email.opened', 'email.clicked', 'email.bounced', 'email.complained'];
const webhookEndpoint = () => `${(process.env.PUBLIC_SITE_URL || brandUrl()).replace(/\/$/, '')}/api/resend/webhook`;
const senderDomain = () => (from().match(/@([^>\s]+)/) || [])[1] || '';

async function trackingStatus() {
  const snap = await db.collection('serverConfig').doc('resendWebhook').get();
  return {
    emailReady: !!(resend && from()), from: from(), endpoint: webhookEndpoint(), domain: senderDomain(),
    webhook: !!process.env.RESEND_WEBHOOK_SECRET || !!(snap.exists && snap.get('secret')),
    webhookVia: process.env.RESEND_WEBHOOK_SECRET ? 'env' : snap.exists && snap.get('secret') ? (snap.get('via') || 'portal') : null,
    openTracking: snap.exists ? snap.get('openTracking') ?? null : null,
    clickTracking: snap.exists ? snap.get('clickTracking') ?? null : null,
    setUpAt: snap.exists ? millis(snap.get('setUpAt')) : null,
  };
}

/**
 * One click: turns on open and click tracking for the sending domain and adds
 * the webhook in Resend, keeping its signing secret server-side. Needs a
 * full-access Resend key; with a sending-only key it says what to do by hand.
 */
async function setUpTracking(req) {
  if (!resend) throw new HttpError(503, 'Resend isn’t set up (RESEND_API_KEY is missing)');
  const notes = [];
  const fail = e => (e && (e.name === 'restricted_api_key' || /restricted|permission/i.test(e.message || ''))
    ? 'Your Resend API key can only send emails. Use the manual steps below, or swap it for a full-access key.'
    : `Resend: ${(e && e.message) || JSON.stringify(e)}`);

  let openTracking = null, clickTracking = null;
  const { data: domains, error: dErr } = await resend.domains.list();
  if (dErr) throw new HttpError(502, fail(dErr));
  const domain = ((domains && domains.data) || []).find(d => d.name === senderDomain());
  if (!domain) notes.push(`${senderDomain() || 'The sending domain'} isn’t in this Resend account, so tracking wasn’t turned on there.`);
  else {
    const { error } = await resend.domains.update({ id: domain.id, openTracking: true, clickTracking: true });
    if (error) notes.push(fail(error)); else { openTracking = true; clickTracking = true; }
  }

  const endpoint = webhookEndpoint();
  const { data: hooks, error: hErr } = await resend.webhooks.list();
  if (hErr) throw new HttpError(502, fail(hErr));
  let hook = ((hooks && hooks.data) || []).find(h => h.endpoint === endpoint);
  let secret;
  if (hook) {
    await resend.webhooks.update(hook.id, { events: WEBHOOK_EVENTS, status: 'enabled' });
    const { data: full, error } = await resend.webhooks.get(hook.id);
    if (error) throw new HttpError(502, fail(error));
    secret = full.signing_secret;
  } else {
    const { data: made, error } = await resend.webhooks.create({ endpoint, events: WEBHOOK_EVENTS });
    if (error) throw new HttpError(502, fail(error));
    hook = made; secret = made.signing_secret;
  }
  await db.collection('serverConfig').doc('resendWebhook').set({
    id: hook.id, secret, endpoint, via: 'portal', openTracking, clickTracking, setUpAt: FieldValue.serverTimestamp(), by: req.admin.email || req.admin.uid,
  }, { merge: true });
  secretCache = { value: null, at: 0 };
  return { ...(await trackingStatus()), notes };
}

/** Manual route: paste the signing secret from Resend > Webhooks. Stored server-side only. */
async function saveWebhookSecret(req) {
  const secret = str(req.body.secret, 200);
  if (!/^whsec_[A-Za-z0-9+/=]{20,}$/.test(secret)) throw new HttpError(400, 'That doesn’t look like a Resend signing secret (it starts with whsec_)');
  await db.collection('serverConfig').doc('resendWebhook').set({
    secret, endpoint: webhookEndpoint(), via: 'pasted', setUpAt: FieldValue.serverTimestamp(), by: req.admin.email || req.admin.uid,
  }, { merge: true });
  secretCache = { value: null, at: 0 };
  return trackingStatus();
}

// ---- Erasing a person ------------------------------------------------------------

/** Removes one email from every campaign's results (for a privacy erasure, server/deletes.js). */
export async function eraseFromCampaigns(email) {
  const id = customerId(email);
  const [campaigns, sends] = await Promise.all([
    db.collection('campaigns').select().get(),
    db.collection('campaignEmails').where('email', '==', id).get(),
  ]);
  let n = 0;
  for (const c of campaigns.docs) {
    const r = c.ref.collection('recipients').doc(id);
    if ((await r.get()).exists) { await r.delete(); n++; }
  }
  await Promise.all(sends.docs.map(d => d.ref.delete()));
  return n;
}

// ---- Routes --------------------------------------------------------------------

export function adminMarketingRoutes(handle) {
  const router = express.Router();
  router.get('/api/admin/marketing/templates', handle(async () => Object.entries(TEMPLATES).map(([id, t]) => ({ id, name: t.name, blurb: t.blurb, heroImage: t.content.heroImage }))));
  router.get('/api/admin/marketing/campaigns', handle(listCampaigns));
  router.post('/api/admin/marketing/campaigns', handle(createCampaign));
  router.get('/api/admin/marketing/campaigns/:id', handle(campaignDetail));
  router.post('/api/admin/marketing/campaigns/:id', handle(saveCampaign));
  router.post('/api/admin/marketing/campaigns/:id/duplicate', handle(duplicateCampaign));
  router.post('/api/admin/marketing/campaigns/:id/delete', handle(deleteCampaign));
  router.post('/api/admin/marketing/campaigns/:id/test', handle(sendTest));
  router.post('/api/admin/marketing/campaigns/:id/send', handle(startSend));
  router.post('/api/admin/marketing/campaigns/:id/send/next', handle(sendStep));
  router.post('/api/admin/marketing/campaigns/:id/sync', handle(syncFromResend));
  router.post('/api/admin/marketing/preview', handle(preview));
  router.get('/api/admin/marketing/audience', handle(audienceSummary));
  router.get('/api/admin/marketing/tracking', handle(trackingStatus));
  router.post('/api/admin/marketing/tracking/setup', handle(setUpTracking));
  router.post('/api/admin/marketing/tracking/secret', handle(saveWebhookSecret));
  return router;
}
