// Seeds Firestore from the current site data.
//
//   products/{id}       <- assets/data/products.js (public catalogue)
//   collections/{slug}  <- starter collections (scripts/catalogue.mjs)
//   productCosts/{id}   <- private/AXIA-backend-data.json  products[].economics (admin only)
//   internal/costAssumptions, internal/firstDropPlan <- same private file
//
// Usage:
//   npm run seed                                   # emulators, default private file path
//   npm run seed -- --private ~/Downloads/AXIA-backend-data.json
//   npm run seed -- --prod                         # LIVE project (asks for confirmation)
//   npm run seed -- --skip-products                # only (re)load costs
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { FieldValue } from 'firebase-admin/firestore';
import { auth, db, PROD, PROJECT_ID, argValue } from './_firebase.mjs';
import { loadStaticCatalogue, STARTER_COLLECTIONS, withLegacyCollections } from './catalogue.mjs';

const PRIVATE_PATH = resolve(argValue('--private') || 'private/AXIA-backend-data.json');
const skipProducts = process.argv.includes('--skip-products');
const force = process.argv.includes('--yes');

if (PROD && !force) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(`This overwrites products and costs in the LIVE "${PROJECT_ID}" Firestore. Type the project id to continue: `);
  rl.close();
  if (a.trim() !== PROJECT_ID) { console.log('Aborted.'); process.exit(1); }
}

async function commitInChunks(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach(fn => fn(batch));
    await batch.commit();
  }
}

if (!skipProducts) {
  const products = loadStaticCatalogue();
  await commitInChunks(products.map((p, i) => batch => {
    batch.set(db.collection('products').doc(p.id), { ...withLegacyCollections(p), sort: i * 10, archived: false, updatedAt: FieldValue.serverTimestamp() });
  }));
  console.log(`✓ products: ${products.length} documents`);
  await commitInChunks(STARTER_COLLECTIONS.map(c => batch => {
    batch.set(db.collection('collections').doc(c.slug), { ...c, updatedAt: FieldValue.serverTimestamp() });
  }));
  console.log(`✓ collections: ${STARTER_COLLECTIONS.length} documents`);
}

if (existsSync(PRIVATE_PATH)) {
  const data = JSON.parse(readFileSync(PRIVATE_PATH, 'utf8'));
  const rows = (data.products || []).filter(p => p.id && p.economics);
  await commitInChunks(rows.map(p => batch => {
    const e = p.economics;
    batch.set(db.collection('productCosts').doc(p.id), {
      id: p.id,
      name: p.name,
      category: p.category || null,
      representativeSize: e.representative_size ?? null,
      factoryCostAUD: e.factory_cost_AUD ?? null,
      factoryCostEstimated: !!e.factory_cost_estimated,
      notes: '',
      // snapshot from the margins sheet; the portal recalculates live from current prices
      sheet: e,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }));
  console.log(`✓ productCosts: ${rows.length} documents (private)`);

  const ca = data.cost_assumptions || {};
  await db.collection('internal').doc('costAssumptions').set({
    paymentFeePct: ca.payment_fee_pct ?? 0.026,
    paymentFeeFixedAUD: ca.payment_fee_fixed_AUD ?? 0.3,
    packagingPerUnitAUD: ca.packaging_per_unit_AUD ?? 2,
    shippingAUD: 0,
    returnsReservePct: ca.returns_reserve_pct ?? 0.05,
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (data.first_drop_plan) {
    await db.collection('internal').doc('firstDropPlan').set({ ...data.first_drop_plan, updatedAt: FieldValue.serverTimestamp() });
  }
  console.log('✓ internal: costAssumptions, firstDropPlan (private)');
} else {
  console.log(`- No private cost file at ${PRIVATE_PATH}; skipped costs. Pass --private <path> to load it.`);
}
// Local only: a ready-made admin login for the emulator.
if (!PROD) {
  const email = 'admin@axia.test', password = 'axia-admin-123';
  const user = await auth.getUserByEmail(email).catch(() => auth.createUser({ email, password, emailVerified: true }));
  await auth.setCustomUserClaims(user.uid, { admin: true });
  console.log(`✓ emulator admin login: ${email} / ${password}`);
}
process.exit(0);
