// GET /api/catalogue  The storefront's catalogue, collections and public site
// settings in one response (assets/js/catalogue.js).
//
// Browsers used to read products/ straight from Firestore, which handed every
// visitor the whole collection, Coming soon pieces included. products/ is now
// admins only; this answers with the public view from public-catalogue.js.
// Read through the Admin SDK and kept for a few seconds per instance, so a busy
// page doesn't turn into a stream of Firestore reads.
import express from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './services.js';
import { publicProducts, mergedIds } from './public-catalogue.js';
import { activeDiscount } from './variants.js';
import { activePromotions, publicGiveaway, publicPromotions } from './promotions.js';

const TTL = 15_000;
const SITE_DOCS = ['countdown', 'shop', 'media', 'reviews', 'discount', 'promotions', 'giveaway'];

// Firestore Timestamps as ISO strings, the way the REST API used to give them.
function plain(v) {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = plain(v[k]); return o; }
  return v;
}

async function build() {
  const [products, collections, ...site] = await Promise.all([
    db.collection('products').get(),
    db.collection('collections').get(),
    ...SITE_DOCS.map(id => db.collection('site').doc(id).get()),
  ]);
  const cols = collections.docs.map(d => { const { updatedAt, ...c } = d.data(); return plain(c); });
  const all = products.docs.map(d => ({ ...d.data(), id: d.id }));
  const out = {
    products: publicProducts(all).map(plain),
    // Old product ids merged into another, so old links land on the right width.
    merged: mergedIds(all),
    collections: cols,
    site: {},
  };
  SITE_DOCS.forEach((id, i) => { out.site[id] = site[i].exists ? plain(site[i].data()) : null; });
  // Only a running store discount goes out: { pct, allowPromos, endsAt }. The storefront
  // takes it off every price the way the server does at checkout.
  const raw = id => { const d = site[SITE_DOCS.indexOf(id)]; return d.exists ? d.data() : null; };
  out.site.discount = activeDiscount(raw('discount'));
  // Only running promotions go out (promotions.js), the older store discount among them.
  // A promotion that's switched off, scheduled for later or ended never reaches browsers.
  out.site.promotions = publicPromotions(activePromotions(raw('promotions'), raw('discount')));
  out.site.giveaway = publicGiveaway(raw('giveaway'));
  return out;
}

let cache = { at: 0, body: null, pending: null };
export async function catalogue() {
  if (cache.body && Date.now() - cache.at < TTL) return cache.body;
  if (!cache.pending) {
    cache.pending = build().then(body => { cache = { at: Date.now(), body, pending: null }; return body; },
      err => { cache.pending = null; throw err; });
  }
  return cache.pending;
}

export function catalogueRoutes() {
  const router = express.Router();
  router.get('/api/catalogue', async (req, res) => {
    try {
      const body = await catalogue();
      res.set('Cache-Control', 'public, max-age=15').json(body);
    } catch (err) {
      console.error('catalogue: read failed', err);
      res.set('Cache-Control', 'no-store').status(503).json({ error: 'Catalogue unavailable' });
    }
  });
  return router;
}
