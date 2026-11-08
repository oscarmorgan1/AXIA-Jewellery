// Editing promo codes (server/admin.js editPromo) against the Firestore emulator,
// with Stripe faked in memory: `npm run test:promos`.
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
delete process.env.RESEND_API_KEY;

const { db, stripe } = await import('../server/services.js');
const { editPromo } = await import('../server/admin.js');
const { Timestamp } = await import('firebase-admin/firestore');

// A tiny Stripe: coupons and promotion codes, with the "one active code per text" rule.
let codes, coupons, n;
stripe.coupons.create = async p => { const c = { id: `co_${++n}`, ...p }; coupons.set(c.id, c); return c; };
stripe.promotionCodes.retrieve = async id => { const c = codes.get(id); if (!c) throw Object.assign(new Error('missing'), { code: 'resource_missing' }); return c; };
stripe.promotionCodes.update = async (id, p) => { const c = codes.get(id); Object.assign(c, p, p.metadata ? { metadata: { ...c.metadata, ...p.metadata } } : {}); return c; };
stripe.promotionCodes.create = async p => {
  if ([...codes.values()].some(c => c.active && c.code === p.code)) throw Object.assign(new Error('An active promotion code with `code: ' + p.code + '` already exists.'), { type: 'StripeInvalidRequestError' });
  const c = { id: `promo_${++n}`, active: true, times_redeemed: 0, livemode: false, ...p };
  codes.set(c.id, c); return c;
};

const req = body => ({ params: { id: 'promo_1' }, body, admin: { email: 'admin@axia.test' } });
const base = { code: 'JESS15', percentOff: 15, kind: 'affiliate', affiliateName: 'Jess', affiliateEmail: '', maxRedemptions: 10, expiresAt: null };
const doc = async () => (await db.doc('promoCodes/promo_1').get()).data();

beforeEach(async () => {
  codes = new Map(); coupons = new Map(); n = 1;
  for (const c of await db.listCollections()) await db.recursiveDelete(c);
  codes.set('promo_1', { id: 'promo_1', code: 'JESS15', active: true, times_redeemed: 3, max_redemptions: 10, metadata: { kind: 'affiliate', affiliate: 'Jess' } });
  await db.doc('promoCodes/promo_1').set({ code: 'JESS15', kind: 'affiliate', percentOff: 15, affiliate: { name: 'Jess', email: '' }, active: true,
    maxRedemptions: 10, expiresAt: null, stripe: { couponId: 'co_1', promotionCodeId: 'promo_1', livemode: false }, createdAt: Timestamp.now() });
});

test('affiliate details change in place, without a new Stripe code', async () => {
  const r = await editPromo(req({ ...base, affiliateName: 'Jess Smith', affiliateEmail: 'jess@example.com' }));
  assert.deepEqual(r, { id: 'promo_1', changed: true, replaced: false });
  const d = await doc();
  assert.deepEqual(d.affiliate, { name: 'Jess Smith', email: 'jess@example.com' });
  assert.equal(d.stripe.promotionCodeId, 'promo_1');
  assert.equal(codes.get('promo_1').metadata.affiliate, 'Jess Smith');
  assert.equal(codes.size, 1);
});

test('nothing changed is a no-op', async () => {
  assert.deepEqual(await editPromo(req(base)), { id: 'promo_1', changed: false });
});

test('renaming and changing the discount replaces the Stripe code under the same record', async () => {
  const r = await editPromo(req({ ...base, code: 'JESS20', percentOff: 20 }));
  assert.equal(r.replaced, true);
  const d = await doc();
  assert.equal(d.code, 'JESS20');
  assert.equal(d.percentOff, 20);
  assert.notEqual(d.stripe.promotionCodeId, 'promo_1');
  assert.deepEqual(d.stripe.previousPromotionCodeIds, ['promo_1']);
  assert.deepEqual(d.previousCodes, ['JESS15']);
  assert.equal(d.redeemedBefore, 3);
  assert.equal(codes.get('promo_1').active, false);
  const now = codes.get(d.stripe.promotionCodeId);
  assert.equal(now.code, 'JESS20');
  assert.equal(now.active, true);
  assert.equal(now.max_redemptions, 7); // 10 in total, 3 already used
  assert.equal(coupons.get(now.promotion.coupon).percent_off, 20);
});

test('same text, new limit: the old code goes off first so the text is free', async () => {
  await editPromo(req({ ...base, maxRedemptions: 50 }));
  const d = await doc();
  assert.equal(codes.get(d.stripe.promotionCodeId).code, 'JESS15');
  assert.equal(codes.get(d.stripe.promotionCodeId).promotion.coupon, 'co_1'); // same discount: coupon reused
  assert.equal(codes.get(d.stripe.promotionCodeId).max_redemptions, 47);
});

test('a limit at or below the uses so far is refused, and nothing changes', async () => {
  await assert.rejects(editPromo(req({ ...base, maxRedemptions: 3 })), /used 3 times/);
  assert.equal(codes.get('promo_1').active, true);
  assert.equal((await doc()).stripe.promotionCodeId, 'promo_1');
});

test('if Stripe refuses the new code, the old one is switched back on', async () => {
  const orig = stripe.promotionCodes.create;
  stripe.promotionCodes.create = async () => { throw new Error('Stripe down'); };
  try { await assert.rejects(editPromo(req({ ...base, percentOff: 25 })), /Stripe down/); } finally { stripe.promotionCodes.create = orig; }
  assert.equal(codes.get('promo_1').active, true);
  assert.equal((await doc()).percentOff, 15);
});

test('a name another code has is refused', async () => {
  await db.doc('promoCodes/other').set({ code: 'TAKEN', stripe: {} });
  await assert.rejects(editPromo(req({ ...base, code: 'TAKEN' })), /already exists/);
});
