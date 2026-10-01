import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

// Public web config (safe to ship: access is enforced by Auth + security rules).
const firebaseConfig = {
  apiKey: 'AIzaSyAXFXM3znoKUCD2ZPFfB8saBwV9r4eKItA',
  authDomain: 'axia-jewellery.firebaseapp.com',
  projectId: 'axia-jewellery',
  storageBucket: 'axia-jewellery.firebasestorage.app',
  messagingSenderId: '1028035994102',
  appId: '1:1028035994102:web:bf9d61e9af5db0ace527d7',
  measurementId: 'G-CEJCB75B6B',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// On localhost the portal talks to the Firebase emulators unless
// VITE_USE_EMULATORS=false is set (e.g. to point a local build at production).
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
export const usingEmulators = isLocal && import.meta.env.VITE_USE_EMULATORS !== 'false';

if (usingEmulators) {
  const host = '127.0.0.1';
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectStorageEmulator(storage, host, 9199);
}

// Storefront images are stored as site-relative paths ("assets/img/...").
// In `vite dev` the storefront is served by the Hosting emulator on :5000.
export function siteUrl(path: string): string {
  if (!path) return '';
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
  const origin = import.meta.env.DEV ? 'http://127.0.0.1:5000' : '';
  return `${origin}/${path.replace(/^\//, '')}`;
}
