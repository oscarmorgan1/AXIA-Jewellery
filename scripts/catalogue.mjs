// The catalogue files.
//
//   private/catalogue.json     the full catalogue, Coming soon pieces included: the
//                              seed source. private/ is git-ignored (this repo is
//                              public) and never served.
//   assets/data/products.js    the storefront's offline fallback: the PUBLIC view
//                              only (server/public-catalogue.js), the same thing
//                              GET /api/catalogue sends. Committed.
// Both are written by `npm run export:products`. Without private/catalogue.json,
// seeding uses the public view, so Coming soon pieces arrive as teasers.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { publicProducts } from '../server/public-catalogue.js';

export const FULL_PATH = new URL('../private/catalogue.json', import.meta.url);
export const CATALOGUE_PATH = new URL('../assets/data/products.js', import.meta.url);

export function loadStaticCatalogue() {
  if (existsSync(FULL_PATH)) {
    const products = JSON.parse(readFileSync(FULL_PATH, 'utf8'));
    if (!Array.isArray(products)) throw new Error('private/catalogue.json is not a list of products');
    return products;
  }
  console.warn('No private/catalogue.json (run `npm run export:products -- --prod`): seeding the public view, Coming soon pieces as teasers.');
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(CATALOGUE_PATH, 'utf8'), ctx);
  const products = ctx.window.AXIA_PRODUCTS;
  if (!Array.isArray(products)) throw new Error('assets/data/products.js did not define window.AXIA_PRODUCTS');
  return JSON.parse(JSON.stringify(products));
}

const HEADER = `/* ============================================================
   AXIA, PUBLIC PRODUCT CATALOGUE (offline fallback)
   The live catalogue is the Firestore "products" collection, edited in
   the admin portal (/admin). Browsers get it from GET /api/catalogue;
   this file is only used if that can't be reached.
   Written by \`npm run export:products\`: do not edit by hand.
   PUBLIC VIEW ONLY (server/public-catalogue.js): live pieces with their
   retail prices, Coming soon pieces as teasers with no prices or
   description. The full catalogue (the seed source) is
   private/catalogue.json, which is never committed or served.
   ============================================================ */
`;

/** Writes both files from a full product list (portal order, no bookkeeping). */
export function writeCatalogueFiles(products) {
  mkdirSync(new URL('../private/', import.meta.url), { recursive: true });
  writeFileSync(FULL_PATH, JSON.stringify(products, null, 2) + '\n');
  writeFileSync(CATALOGUE_PATH, HEADER + 'window.AXIA_PRODUCTS = ' + JSON.stringify(publicProducts(products), null, 2) + ';\n');
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
