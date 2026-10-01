// Shared Firebase Admin setup for the scripts in this folder.
//
// By default every script talks to the LOCAL EMULATORS. To touch the live
// project you must pass --prod and be authenticated, either with
// `gcloud auth application-default login` or GOOGLE_APPLICATION_CREDENTIALS
// pointing at a service-account key (keep that file out of git).
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

export const PROJECT_ID = 'axia-jewellery';
export const PROD = process.argv.includes('--prod');

if (PROD) {
  delete process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  console.log(`!! Using the LIVE Firebase project "${PROJECT_ID}".`);
} else {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
  process.env.METADATA_SERVER_DETECTION ||= 'none'; // no Google Cloud metadata lookups against the emulators
  console.log(`Using local emulators (Firestore ${process.env.FIRESTORE_EMULATOR_HOST}, Auth ${process.env.FIREBASE_AUTH_EMULATOR_HOST}).`);
}

const app = initializeApp(PROD ? { projectId: PROJECT_ID, credential: applicationDefault() } : { projectId: PROJECT_ID });
export const db = getFirestore(app);
export const auth = getAuth(app);

export function argValue(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}
