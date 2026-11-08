// What the storefront may see of the catalogue: `node --test tests/catalogue.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicProduct, publicProducts } from '../server/public-catalogue.js';

const soon = {
  id: 'soon-chain', name: 'Soon Chain', width: '15mm', cat: 'chain', coll: ['cuban'], art: 'cuban', col: ['Silver'],
  hidden: true, desc: 'Secret description', stone: 'Secret stone', images: ['assets/img/x.jpg'],
  variants: [{ length: '18"', priceAUD: 1999 }, { length: '20"', priceAUD: 2199 }], fromPriceAUD: 1999,
  compareAtAUD: 2500, bundle: ['a'], bundleOf: ['b'], sort: 30, updatedAt: 'x', factoryCostAUD: 50,
};

test('a Coming soon piece goes out as a teaser: name and photos, no prices or description', () => {
  const out = publicProduct(soon);
  const json = JSON.stringify(out);
  for (const leak of ['1999', '2199', '2500', 'Secret', 'bundle', 'factoryCost', '"sort"', 'updatedAt']) {
    assert.ok(!json.includes(leak), `leaked ${leak}`);
  }
  assert.equal(out.name, 'Soon Chain');
  assert.deepEqual(out.images, ['assets/img/x.jpg']);
  assert.equal(out.hidden, true);
  assert.equal(out.fromPriceAUD, 0);
  assert.deepEqual(out.variants, [{ length: '18"', priceAUD: 0 }]);
});

test('a piece with its own showcase page keeps the description and lengths that page shows', () => {
  const out = publicProduct({ ...soon, id: 'the-titan', linkTo: 'titans.html', titan: true });
  assert.equal(out.desc, 'Secret description');
  assert.deepEqual(out.variants.map(v => v.length), ['18"', '20"']);
  assert.ok(out.variants.every(v => v.priceAUD === 0));
});

test('live pieces go out in full minus bookkeeping; archived ones not at all; the order follows sort', () => {
  const live = { id: 'live', name: 'Live', variants: [{ length: '8"', priceAUD: 199 }], fromPriceAUD: 199, desc: 'Shown', sort: 20, updatedAt: 'x', archived: false };
  const out = publicProducts([soon, live, { id: 'gone', name: 'Gone', archived: true, sort: 1 }]);
  assert.deepEqual(out.map(p => p.id), ['live', 'soon-chain']);
  assert.equal(out[0].fromPriceAUD, 199);
  assert.equal(out[0].desc, 'Shown');
  assert.ok(!('sort' in out[0]) && !('updatedAt' in out[0]) && !('archived' in out[0]));
});
