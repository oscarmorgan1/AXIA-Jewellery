// Firebase Admin, Stripe and Resend clients, created once from the environment.
//
// On App Hosting the Admin SDK finds the project and credentials by itself.
// Locally, `npm run serve` points it at the emulators (FIRESTORE_EMULATOR_HOST).
// Stripe and Resend keys come from App Hosting secrets (see apphosting.yaml);
// when one is missing the matching feature reports itself as not set up
// instead of crashing the site.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { Resend } from 'resend';

const app = initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: 'axia-jewellery' } : undefined);
export const db = getFirestore(app);

export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
export const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function getProduct(id) {
  const snap = await db.collection('products').doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/** The Open shop switch in the admin portal (Website > Shop). Closed unless switched on. */
export async function isShopOpen() {
  const snap = await db.collection('site').doc('shop').get();
  return snap.exists && snap.get('open') === true;
}
