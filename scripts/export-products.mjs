// Writes the current Firestore catalogue back to assets/data/products.js.
// That file is the storefront's offline fallback (used if Firestore is
// unreachable), so refresh it before each deploy:
//   npm run export:products -- --prod
import { writeFileSync } from 'node:fs';
import { db } from './_firebase.mjs';
import { CATALOGUE_PATH } from './catalogue.mjs';

const snap = await db.collection('products').orderBy('sort').get();
const products = snap.docs.map(d => d.data()).filter(p => !p.archived).map(({ sort, archived, updatedAt, ...p }) => p);

const header = `/* ============================================================
   AXIA, PRODUCT CATALOGUE (offline fallback + seed source)
   The live catalogue is the Firestore "products" collection, edited in
   the admin portal (/admin) and loaded by assets/js/catalogue.js.
   This file is only used if Firestore can't be reached, and to seed a
   fresh database. Refresh it with \`npm run export:products -- --prod\`.
   PUBLIC DATA ONLY: customer-facing AUD retail prices.
   Factory/manufacturer costs are deliberately NOT included here
   (private business data, must never appear on the website).
   ============================================================ */
`;
writeFileSync(CATALOGUE_PATH, header + 'window.AXIA_PRODUCTS = ' + JSON.stringify(products, null, 2) + ';\n');
console.log(`Wrote ${products.length} products to assets/data/products.js`);
process.exit(0);
