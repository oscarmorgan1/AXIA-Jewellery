// One-off upgrade for a database seeded before collections existed.
// Safe to re-run: it only ADDS what's missing and never overwrites your edits.
//   - creates any starter collection that doesn't exist yet
//   - adds bundles to "sets", and uncategorised pieces to "cuban" (the old shop-tab rules)
//
//   npm run migrate:collections            # emulators
//   npm run migrate:collections -- --prod  # live project
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './_firebase.mjs';
import { STARTER_COLLECTIONS, withLegacyCollections } from './catalogue.mjs';

let created = 0, updated = 0;
for (const c of STARTER_COLLECTIONS) {
  const ref = db.collection('collections').doc(c.slug);
  if (!(await ref.get()).exists) { await ref.set({ ...c, updatedAt: FieldValue.serverTimestamp() }); created++; }
}
const snap = await db.collection('products').get();
for (const d of snap.docs) {
  const p = d.data();
  const next = withLegacyCollections(p);
  if (next !== p) { await d.ref.update({ coll: next.coll, updatedAt: FieldValue.serverTimestamp() }); updated++; }
}
console.log(`✓ collections created: ${created}, products updated: ${updated}`);
process.exit(0);
