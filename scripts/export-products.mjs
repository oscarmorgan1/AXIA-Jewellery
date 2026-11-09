// Writes the current Firestore catalogue back to the repo:
//   private/catalogue.json       the full catalogue (seed source; git-ignored, never served)
//   assets/data/products.js      the storefront's offline fallback, public view only
// Refresh them before each deploy:
//   npm run export:products -- --prod
import { db } from './_firebase.mjs';
import { writeCatalogueFiles } from './catalogue.mjs';

const snap = await db.collection('products').orderBy('sort').get();
const products = snap.docs.map(d => d.data()).filter(p => !p.archived).map(({ sort, archived, updatedAt, ...p }) => p);
writeCatalogueFiles(products);
console.log(`Wrote ${products.length} products to private/catalogue.json and the public view to assets/data/products.js`);
process.exit(0);
