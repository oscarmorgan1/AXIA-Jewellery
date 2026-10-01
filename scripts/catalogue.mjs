// Reads the static catalogue (assets/data/products.js) the way a browser would.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const CATALOGUE_PATH = new URL('../assets/data/products.js', import.meta.url);

export function loadStaticCatalogue() {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(CATALOGUE_PATH, 'utf8'), ctx);
  const products = ctx.window.AXIA_PRODUCTS;
  if (!Array.isArray(products)) throw new Error('assets/data/products.js did not define window.AXIA_PRODUCTS');
  return JSON.parse(JSON.stringify(products));
}

// Starting collections. Products join a collection by listing its slug in
// `coll`. `showInShop` puts it in the Shop All tabs (in `sort` order).
export const STARTER_COLLECTIONS = [
  { slug: 'sets', name: 'Sets', intro: 'Matched pieces, bought together for less.', showInShop: true, sort: 10 },
  { slug: 'cuban', name: 'The Cuban', tab: 'Cuban', intro: 'The foundation of AXIA. Hand-set, made to be worn every day.', showInShop: true, sort: 20 },
  { slug: 'tennis', name: 'Tennis', intro: 'Clean lines, wall to wall brilliance. Hand-set in 925 silver.', showInShop: true, sort: 30 },
  { slug: 'pendants', name: 'Pendants', intro: 'The cross, on its own or on a chain.', showInShop: true, sort: 40 },
  { slug: 'titans', name: 'The Titans', tab: 'Titans', intro: '18mm. The apex of AXIA, made to order.', showInShop: false, sort: 50 },
  { slug: 'classic-cuban', name: 'Classic Cuban', intro: '', showInShop: false, sort: 60 },
  { slug: 'prong-cuban', name: 'Prong Cuban', intro: '', showInShop: false, sort: 70 },
  { slug: '12mm-cuban', name: '12mm Cuban', intro: '', showInShop: false, sort: 80 },
  { slug: '15mm-cuban', name: '15mm Cuban', intro: '', showInShop: false, sort: 90 },
  { slug: 'flower', name: 'Floral', intro: '', showInShop: false, sort: 100 },
];

/**
 * Shop tabs used to be worked out in code: bundles were "Sets", and anything not
 * tennis/pendants/titans fell into "Cuban". Now membership is explicit, so add
 * those slugs where the old rules implied them.
 */
export function withLegacyCollections(p) {
  const coll = p.coll || [];
  if ((p.bundle || p.bundleOf) && !coll.includes('sets')) return { ...p, coll: ['sets', ...coll] };
  if (!p.bundle && !p.bundleOf && !['titans', 'pendants', 'tennis', 'cuban'].some(k => coll.includes(k))) return { ...p, coll: [...coll, 'cuban'] };
  return p;
}
