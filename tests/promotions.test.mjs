// Promotions (server/promotions.js): which are running, which pieces they cover,
// and that checkout pricing takes them off the current price: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activePromotions, covers, isRunning, normalizePromotion, promoFor, publicGiveaway, publicPromotions } from '../server/promotions.js';
import { priceCart } from '../server/pricing.js';
import { publicProduct } from '../server/public-catalogue.js';

const now = Date.parse('2026-11-22T00:00:00Z');
const P = o => normalizePromotion({ on: true, pct: 30, scope: 'all', ...o });

test('a promotion runs only when on, 1-90%, started, not ended and with pieces to cover', () => {
  assert.equal(isRunning(P({}), now), true);
  assert.equal(isRunning(P({ on: false }), now), false);
  assert.equal(isRunning(P({ pct: 0 }), now), false);
  assert.equal(isRunning(P({ pct: 95 }), now), false);
  assert.equal(isRunning(P({ startsAt: '2026-11-23T00:00:00Z' }), now), false, 'scheduled');
  assert.equal(isRunning(P({ endsAt: '2026-11-21T23:59:59Z' }), now), false, 'ended on its own');
  assert.equal(isRunning(P({ endsAt: '2026-11-29T00:00:00Z' }), now), true);
  assert.equal(isRunning(P({ scope: 'products', productIds: [] }), now), false);
  assert.equal(isRunning(P({ scope: 'collections', collections: ['tennis'] }), now), true);
});

test('active promotions include the older store discount, and bad input never throws', () => {
  const list = activePromotions({ items: [P({ id: 'a' }), P({ id: 'b', on: false }), null, 'x'] }, { on: true, pct: 10 }, now);
  assert.deepEqual(list.map(p => p.id), ['a', 'store-discount']);
  assert.deepEqual(activePromotions(null, null, now), []);
  assert.equal(normalizePromotion({ banner: { ctaHref: 'javascript:alert(1)' } }).banner.ctaHref, '');
  assert.equal(normalizePromotion({ banner: { ctaHref: 'collection?c=tennis' } }).banner.ctaHref, 'collection?c=tennis');
  assert.equal(normalizePromotion({ banner: { theme: 'nope' } }).banner.theme, 'obsidian');
  const pub = publicPromotions(list)[0];
  assert.equal('on' in pub || 'startsAt' in pub, false, 'admin-only fields stay on the server');
});

test('scope: every piece, collections, picked pieces and a price ceiling; the biggest wins', () => {
  const chain = { id: 'chain', coll: ['cuban'] }, tennis = { id: 'tennis', coll: ['tennis', 'women'] };
  assert.equal(covers(P({}), chain, 600), true);
  assert.equal(covers(P({ scope: 'collections', collections: ['women'] }), chain, 600), false);
  assert.equal(covers(P({ scope: 'collections', collections: ['women'] }), tennis, 600), true);
  assert.equal(covers(P({ scope: 'products', productIds: ['chain'] }), chain, 600), true);
  assert.equal(covers(P({ maxPriceAUD: 300 }), chain, 600), false);
  assert.equal(covers(P({ maxPriceAUD: 300 }), chain, 300), true);
  const promos = [P({ id: 'all', pct: 30 }), P({ id: 'vday', pct: 40, scope: 'collections', collections: ['women'] })];
  assert.equal(promoFor(promos, tennis, 500).id, 'vday');
  assert.equal(promoFor(promos, chain, 500).id, 'all');
  assert.equal(promoFor([], chain, 500), null);
});

const products = {
  chain: { id: 'chain', name: 'Chain', coll: ['cuban'], widths: [{ width: '2mm', variants: [{ length: '20"', priceAUD: 600 }] }] },
  bracelet: { id: 'bracelet', name: 'Bracelet', coll: ['tennis'], widths: [{ width: '2mm', variants: [{ length: '7"', priceAUD: 200 }] }] },
  set: { id: 'set', name: 'Set', set: { components: [{ productId: 'chain', width: '2mm', length: '20"' }, { productId: 'bracelet', width: '2mm', length: '7"' }], pricing: { mode: 'fixed', priceAUD: 700 } } },
};
const get = async id => (products[id] ? structuredClone(products[id]) : null);
const bag = [{ id: 'chain', width: '2mm', length: '20"' }, { id: 'bracelet', width: '2mm', length: '7"' }, { id: 'set' }];

test('checkout: 30% storewide comes off every line from the current price', async () => {
  const { lines, subtotalAUD } = await priceCart(bag, get, { promotions: [P({ name: 'Storewide sale' })] });
  assert.deepEqual(lines.map(l => [l.listPriceAUD, l.priceAUD]), [[600, 420], [200, 140], [700, 490]]);
  assert.deepEqual(lines[2].components.map(c => c.priceAUD), [420, 140]);
  assert.equal(lines[0].promo.name, 'Storewide sale');
  assert.equal(subtotalAUD, 1050);
});

test('checkout: changing a price moves the sale price, and the stored price is untouched', async () => {
  const promotions = [P({})];
  products.chain.widths[0].variants[0].priceAUD = 700; // "+A$100 in the backend"
  try {
    const { lines } = await priceCart([bag[0]], get, { promotions });
    assert.equal(lines[0].listPriceAUD, 700);
    assert.equal(lines[0].priceAUD, 490);
    assert.equal(products.chain.widths[0].variants[0].priceAUD, 700);
  } finally { products.chain.widths[0].variants[0].priceAUD = 600; }
});

test('checkout: a promotion only on some pieces or under a price leaves the rest at full price', async () => {
  const a = await priceCart(bag, get, { promotions: [P({ pct: 40, scope: 'collections', collections: ['tennis'] })] });
  assert.deepEqual(a.lines.map(l => l.priceAUD), [600, 120, 700]);
  const b = await priceCart(bag, get, { promotions: [P({ pct: 40, maxPriceAUD: 300 })] });
  assert.deepEqual(b.lines.map(l => l.priceAUD), [600, 120, 700]);
  assert.equal(b.lines[0].promo, undefined);
  const c = await priceCart(bag, get, { promotions: [P({ scope: 'products', productIds: ['set'] })] });
  assert.deepEqual(c.lines.map(l => l.priceAUD), [600, 200, 490]);
  const none = await priceCart(bag, get, { promotions: [] });
  assert.deepEqual(none.lines.map(l => l.priceAUD), [600, 200, 700]);
});

test('checkout ignores a price the browser sends', async () => {
  const { lines } = await priceCart([{ ...bag[0], priceAUD: 1, price: 1 }], get, { promotions: [P({})] });
  assert.equal(lines[0].priceAUD, 420);
});

test('the storefront gets original prices (the sale price is worked out in the browser)', () => {
  const out = publicProduct(products.chain);
  assert.equal(out.widths[0].variants[0].priceAUD, 600);
});

test('giveaway: defaults and a bad date', () => {
  assert.equal(publicGiveaway(null), null);
  assert.deepEqual(publicGiveaway({ endsAt: '2026-12-24T13:00:00.000Z' }), { endsAt: '2026-12-24T13:00:00.000Z', show: true, label: 'The AXIA Giveaway', endedText: 'Entries are closed. Winner announced soon.' });
  assert.equal(publicGiveaway({ endsAt: 'soon' }).endsAt, '');
});
