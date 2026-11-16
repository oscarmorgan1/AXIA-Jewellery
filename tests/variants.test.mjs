// Product options, sets and the merge migration: `node --test tests/variants.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080'; // services.js needs a project; nothing is read here
const { pickVariant, priceSet, setFromPrice, setRefund, partsOf, unitKey } = await import('../server/variants.js');
const { priceCart, CartError } = await import('../server/pricing.js');
const { buildPlan, costKey } = await import('../server/migrate-variants.js');
const { publicProducts, mergedIds } = await import('../server/public-catalogue.js');

// The bundled public catalogue (prices of Coming soon pieces are 0 there, so give them some).
const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL('../assets/data/products.js', import.meta.url), 'utf8'), ctx);
const CATALOGUE = ctx.window.AXIA_PRODUCTS.map((p, i) => {
  const out = JSON.parse(JSON.stringify(p));
  out.sort = i * 10;
  const fill = vs => (vs || []).forEach((v, k) => { if (!(v.priceAUD > 0)) v.priceAUD = 1000 + k * 50; });
  fill(out.variants); (out.widths || []).forEach(w => fill(w.variants));
  return out;
});
const clone = o => JSON.parse(JSON.stringify(o));

const chain = {
  id: 'tennis-chain', name: 'Classic Tennis Chain', col: ['Silver'],
  widths: [
    { width: '2mm', variants: [{ length: '18"', priceAUD: 300 }, { length: '20"', priceAUD: 350 }] },
    { width: '4mm', variants: [{ length: '18"', priceAUD: 480 }, { length: '20"', priceAUD: 500 }] },
    { width: '6.5mm', hidden: true, variants: [{ length: '20"', priceAUD: 1100 }] },
  ],
};
const bracelet = {
  id: 'tennis-bracelet', name: 'Classic Tennis Bracelet', col: ['Silver'],
  widths: [
    { width: '2mm', variants: [{ length: '7"', priceAUD: 140 }] },
    { width: '4mm', variants: [{ length: '7"', priceAUD: 220 }, { length: '8"', priceAUD: 240 }] },
  ],
};
const pendant = { id: 'cross-pendant', name: 'Cross Pendant', singlePrice: true, variants: [{ length: null, priceAUD: 399 }] };
const byId = id => ({ [chain.id]: chain, [bracelet.id]: bracelet, [pendant.id]: pendant })[id] || null;

test('pickVariant finds a width and length, and refuses a Coming soon width', () => {
  assert.equal(pickVariant(chain, '4mm', '20"').priceAUD, 500);
  assert.equal(pickVariant(chain, '6.5mm', '20"'), null);
  assert.equal(pickVariant(chain, '6.5mm', '20"', { allowHidden: true }).priceAUD, 1100);
  assert.equal(pickVariant(chain, '4mm', '26"'), null);
  assert.equal(pickVariant(pendant, null, null).priceAUD, 399);
});

test('a set with a shared width and a discount', () => {
  const set = { id: 'tennis-set', name: 'The Tennis Set', set: {
    sharedWidth: true, pricing: { mode: 'discount', amountAUD: 100 },
    components: [{ productId: 'tennis-chain', width: null, length: null }, { productId: 'tennis-bracelet', width: null, length: null }],
  } };
  const out = priceSet(set, byId, [{ width: '4mm', length: '20"' }, { width: '2mm', length: '8"' }]); // the second width is ignored: shared
  assert.equal(out.priceAUD, 500 + 240 - 100);
  assert.deepEqual(out.components.map(c => c.width), ['4mm', '4mm']);
  // cheapest width both have: 2mm (300 + 140), less 100
  assert.equal(setFromPrice(set, byId), 340);
});

test('a set with fixed sizes at a fixed price', () => {
  const set = { id: 'cross-set', name: 'The Cross Set', set: {
    pricing: { mode: 'fixed', priceAUD: 699 },
    components: [{ productId: 'cross-pendant', width: null, length: null }, { productId: 'tennis-chain', width: '4mm', length: '20"' }],
  } };
  const out = priceSet(set, byId, []);
  assert.equal(out.priceAUD, 699);
  assert.equal(out.components[1].priceAUD, 500);
  assert.throws(() => priceSet({ ...set, set: { ...set.set, components: [{ productId: 'gone' }] } }, byId, []));
});

test('priceCart: sets, merged ids from old bags, and server prices only', async () => {
  const set = { id: 'tennis-set', name: 'The Tennis Set', images: ['a.jpg'], set: {
    pricing: { mode: 'percent', pct: 10 },
    components: [{ productId: 'tennis-chain', width: null, length: null }, { productId: 'tennis-bracelet', width: '4mm', length: null }],
  } };
  const old = { id: 'tennis-chain-4mm', name: 'Classic Tennis Chain', archived: true, mergedInto: { id: 'tennis-chain', width: '4mm' } };
  const all = { ...{ [chain.id]: chain, [bracelet.id]: bracelet }, [set.id]: set, [old.id]: old };
  const get = async id => all[id] || null;
  const { lines } = await priceCart([
    { id: 'tennis-set', q: 1, priceAUD: 1, parts: [{ width: '2mm', length: '18"' }, { length: '8"' }] },
    { id: 'tennis-chain-4mm', length: '18"' },
  ], get);
  assert.equal(lines[0].priceAUD, Math.round((300 + 240) * 0.9));
  assert.equal(lines[0].components.length, 2);
  assert.match(lines[0].options, /Classic Tennis Chain 2mm · 18" \+ Classic Tennis Bracelet 4mm · 8"/);
  assert.equal(lines[1].id, 'tennis-chain');
  assert.equal(lines[1].width, '4mm');
  assert.equal(lines[1].priceAUD, 480);
  await assert.rejects(priceCart([{ id: 'tennis-chain', width: '6.5mm', length: '20"' }], get), CartError);
});

test('set refunds: the set price less what is kept at full price', () => {
  const item = { qty: 1, priceAUD: 800, components: [{ priceAUD: 600 }, { priceAUD: 400 }] };
  assert.equal(setRefund(item, [0, 1]), 200); // return the 400 piece, keep the 600 one
  assert.equal(setRefund(item, [1, 0]), 400);
  assert.equal(setRefund(item, [1, 1]), 800);
  assert.equal(setRefund(item, [1, 1], [0, 1]), 600); // the second piece follows: 800 in all
  assert.equal(partsOf(item), 2);
  assert.equal(unitKey(3, 1), '3:1');
  assert.equal(unitKey(3, null), '3');
});

test('the migration merges same-name products into one with widths', () => {
  const pieces = [
    { key: 'AXIA1', serial: 'AXIA1', productId: 'classic-cuban-bracelet-10mm', size: '10mm · 7"', colour: '' },
    { key: 'AXIA2', serial: 'AXIA2', productId: 'tennis-chain-4mm', size: '20"', colour: 'Silver' },
  ];
  const { writes, report } = buildPlan({ products: clone(CATALOGUE), costs: [{ id: 'iced-cuban-bracelet-5mm', factoryCostAUD: 100, representativeSize: '7"' }], pieces, reviews: null });
  const w = id => writes.find(x => x.collection === 'products' && x.id === id);

  const iced = w('iced-cuban-bracelet').data;
  assert.equal(iced.name, 'Iced Cuban Bracelet');
  assert.deepEqual(iced.widths.map(x => x.width), ['5mm', '10mm', '12mm', '15mm']);
  assert.equal(iced.widths.find(x => x.width === '15mm').hidden, true);
  assert.equal(iced.widths.find(x => x.width === '10mm').variants[0].priceAUD, 699);
  assert.equal(iced.hidden, false);
  assert.equal(iced.collWidth['15mm-cuban'], '15mm');
  assert.equal(iced.fromPriceAUD, 199);
  assert.deepEqual(w('classic-cuban-bracelet-10mm').data.mergedInto, { id: 'iced-cuban-bracelet', width: '10mm' });
  assert.equal(w('classic-cuban-bracelet-10mm').merge, true);

  // the tennis pieces already had widths: the per-width documents only become links
  assert.deepEqual(w('tennis-chain-4mm').data.mergedInto, { id: 'tennis-chain', width: '4mm' });
  assert.equal(w('tennis-chain').data.widths.length, 4);

  // pieces follow, and get their width when the size didn't have it
  const p2 = writes.find(x => x.collection === 'pieces' && x.id === 'AXIA2').data;
  assert.equal(p2.productId, 'tennis-chain');
  assert.equal(p2.size, '4mm · 20"');
  assert.equal(writes.find(x => x.collection === 'pieces' && x.id === 'AXIA1').data.size, '10mm · 7"');

  // the old 5mm cost becomes the cost of that size
  const cost = writes.find(x => x.collection === 'productCosts' && x.id === 'iced-cuban-bracelet').data;
  assert.equal(cost.variants[costKey('5mm', '7"')].factoryCostAUD, 100);

  // the Cross Set becomes a real set at the same price
  const cross = w('cross-set').data;
  assert.equal(cross.set.pricing.priceAUD, 699);
  assert.deepEqual(cross.set.components[1], { productId: 'tennis-chain', width: '4mm', length: '20"' });

  // a set without listed pieces is left for the set editor
  assert.ok(report.sets.find(s => s.id === 'tennis-set').action.includes('set editor'));
  // titans are never merged
  assert.ok(!writes.some(x => x.id === 'the-titan'));
});

test('the migration imports the cost sheet, and prices and new sizes only when asked', () => {
  const sheet = {
    settings: { usdPerAud: 0.5, freightUSD: 20, gstPct: 0.1 },
    rows: [
      { family: 'Cuban Bracelet', width: '10mm', length: '7"', factoryUSD: 100, retailAUD: 799, basis: 'PDF quoted' },
      { family: 'Tennis Chain', width: '6.5mm', length: '16"', factoryUSD: 224, retailAUD: 1099 },
      { family: 'Multicolour Cross', width: null, length: null, factoryUSD: 150, retailAUD: 599 },
      { family: 'Nope', width: '1mm', length: '1"', factoryUSD: 1, retailAUD: 2 },
    ],
  };
  const base = { products: clone(CATALOGUE), costs: [], pieces: [], reviews: null };
  let { writes, report } = buildPlan(base, { sheet });
  const cost = id => writes.find(x => x.collection === 'productCosts' && x.id === id).data;
  assert.equal(cost('iced-cuban-bracelet').variants['10mm|7"'].factoryCostAUD, 200);
  assert.equal(cost('iced-cuban-bracelet').variants['10mm|7"'].factoryCostUSD, 100);
  assert.equal(cost('cross-pendant').variants['|'].factoryCostAUD, 300);
  assert.equal(writes.find(x => x.id === 'costAssumptions').data.freightUSD, 20);
  assert.equal(report.costs.unmatched.length, 2); // 6.5mm isn't sold; Nope isn't a product
  assert.equal(writes.find(x => x.id === 'iced-cuban-bracelet').data.widths.find(x => x.width === '10mm').variants.find(v => v.length === '7"').priceAUD, 749);

  ({ writes, report } = buildPlan(base, { sheet, applyPrices: true, addSizes: true }));
  const iced = writes.find(x => x.id === 'iced-cuban-bracelet').data;
  assert.equal(iced.widths.find(x => x.width === '10mm').variants.find(v => v.length === '7"').priceAUD, 799);
  const chainWidths = writes.find(x => x.id === 'tennis-chain').data.widths;
  assert.equal(chainWidths.at(-1).width, '6.5mm');
  assert.equal(chainWidths.at(-1).hidden, true);
  assert.equal(report.costs.newSizes.length, 1);
  assert.ok(report.costs.priceChanges.some(c => c.product === 'Iced Cuban Bracelet' && c.to === 799));
});

test('public catalogue: Coming soon widths have no prices, merged ids are listed, sets carry their options', () => {
  const merged = { id: 'old', name: 'Old', archived: true, mergedInto: { id: 'tennis-chain', width: '4mm' } };
  const set = { id: 'tennis-set', name: 'The Tennis Set', variants: [{ length: null, priceAUD: 1 }], set: {
    pricing: { mode: 'discount', amountAUD: 50 }, components: [{ productId: 'tennis-chain', width: null, length: null }, { productId: 'cross-pendant', width: null, length: null }],
  } };
  const list = publicProducts([chain, pendant, merged, set]);
  const c = list.find(p => p.id === 'tennis-chain');
  assert.ok(!JSON.stringify(c.widths[2]).includes('1100'));
  assert.equal(c.widths[2].hidden, true);
  assert.equal(c.fromPriceAUD, 300);
  assert.ok(!list.some(p => p.id === 'old'));
  assert.deepEqual(mergedIds([merged]), { old: { id: 'tennis-chain', width: '4mm' } });
  const s = list.find(p => p.id === 'tennis-set');
  assert.equal(s.fromPriceAUD, 300 + 399 - 50);
  assert.deepEqual(s.set.components[0].options.map(o => o.width), ['2mm', '4mm']); // not the Coming soon width
  assert.equal(s.set.components[1].options[0].lengths[0].priceAUD, 399);
});

test('store discount: running window, rounding and cart pricing', async () => {
  const { activeDiscount, salePrice } = await import('../server/variants.js');
  const { priceCart } = await import('../server/pricing.js');
  const now = Date.parse('2026-11-16T00:00:00Z');
  assert.equal(activeDiscount(null, now), null);
  assert.equal(activeDiscount({ on: false, pct: 10 }, now), null);
  assert.equal(activeDiscount({ on: true, pct: 0 }, now), null);
  assert.equal(activeDiscount({ on: true, pct: 95 }, now), null);
  assert.equal(activeDiscount({ on: true, pct: 10, endsAt: '2026-11-15T00:00:00Z' }, now), null);
  assert.deepEqual(activeDiscount({ on: true, pct: 10, endsAt: '2026-11-20T00:00:00Z', allowPromos: false }, now), { pct: 10, allowPromos: false, endsAt: '2026-11-20T00:00:00Z' });
  assert.equal(salePrice(199, 10), 179);
  assert.equal(salePrice(1299, 15), 1104);
  assert.equal(salePrice(199, 0), 199);

  const products = {
    chain: { id: 'chain', name: 'Chain', widths: [{ width: '2mm', variants: [{ length: '20"', priceAUD: 600 }] }] },
    bracelet: { id: 'bracelet', name: 'Bracelet', widths: [{ width: '2mm', variants: [{ length: '7"', priceAUD: 400 }] }] },
    set: { id: 'set', name: 'Set', set: { components: [{ productId: 'chain', width: '2mm', length: '20"' }, { productId: 'bracelet', width: '2mm', length: '7"' }], pricing: { mode: 'fixed', priceAUD: 800 } } },
  };
  const get = async id => products[id] || null;
  const { lines, subtotalAUD } = await priceCart([{ id: 'chain', width: '2mm', length: '20"' }, { id: 'set' }], get, { discountPct: 10 });
  assert.equal(lines[0].priceAUD, 540);
  assert.equal(lines[0].listPriceAUD, 600);
  assert.equal(lines[1].priceAUD, 720);
  assert.deepEqual(lines[1].components.map(c => c.priceAUD), [540, 360]);
  assert.equal(subtotalAUD, 1260);
  const full = await priceCart([{ id: 'chain', width: '2mm', length: '20"' }], get);
  assert.equal(full.lines[0].priceAUD, 600);
  assert.equal(full.lines[0].listPriceAUD, undefined);
});

test('merged widths keep their colour photos, and an earlier merge gets them back', () => {
  const src = CATALOGUE.find(p => p.id === 'classic-cuban-bracelet-10mm');
  assert.ok(src && src.imagesByColor, 'fixture has colour photos');
  const { writes } = buildPlan({ products: clone(CATALOGUE), costs: [], pieces: [], reviews: null });
  const iced = writes.find(x => x.collection === 'products' && x.id === 'iced-cuban-bracelet').data;
  assert.deepEqual(iced.widths.find(w => w.width === '10mm').imagesByColor, src.imagesByColor);

  // As the first run left it: merged, but the width without its colour photos.
  const after = clone(CATALOGUE).map(p => p.id === 'classic-cuban-bracelet-10mm' ? { ...p, archived: true, mergedInto: { id: 'iced-cuban-bracelet', width: '10mm' } } : p);
  const old = clone(iced); old.widths.forEach(w => { delete w.imagesByColor; });
  after.push({ ...old, id: 'iced-cuban-bracelet' });
  const again = buildPlan({ products: after.filter(p => !(p.name === 'Iced Cuban Bracelet' && !p.mergedInto && p.id !== 'iced-cuban-bracelet')).map(p => p.name === 'Iced Cuban Bracelet' && p.id !== 'iced-cuban-bracelet' ? { ...p, archived: true, mergedInto: p.mergedInto || { id: 'iced-cuban-bracelet', width: p.width } } : p), costs: [], pieces: [], reviews: null });
  const fixed = again.writes.find(x => x.collection === 'products' && x.id === 'iced-cuban-bracelet');
  assert.ok(fixed && fixed.merge, 'the merged product is updated in place');
  assert.deepEqual(fixed.data.widths.find(w => w.width === '10mm').imagesByColor, src.imagesByColor);
  assert.ok(again.report.notes.some(n => n.includes('colour photos')));
});
