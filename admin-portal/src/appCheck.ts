import type { FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } from 'firebase/app-check';

// Firebase App Check: proves requests to Auth, Firestore and Storage come from
// this site (reCAPTCHA scores the browser) and not from a script using our
// public API key. The server's Admin SDK calls are not affected.
//
// Build-time settings (apphosting.yaml, where the site key is the secret
// appcheck-site-key; locally, admin-portal/.env.local):
//   VITE_APPCHECK_SITE_KEY      reCAPTCHA site key registered in Firebase > App Check.
//                               Not set: App Check stays off (nothing changes).
//   VITE_APPCHECK_PROVIDER      "enterprise" for a reCAPTCHA Enterprise key,
//                               anything else (default) for reCAPTCHA v3.
//   VITE_APPCHECK_DEBUG_TOKEN   localhost only, for a local build pointed at
//                               production (VITE_USE_EMULATORS=false). Leave unset
//                               to have the browser console print a new token,
//                               then add it in Firebase > App Check > Manage debug tokens.
// Against the emulators App Check is skipped: they don't check tokens.

declare global {
  // eslint-disable-next-line no-var
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

export function startAppCheck(app: FirebaseApp, usingEmulators: boolean): void {
  const env = import.meta.env;
  const siteKey = env.VITE_APPCHECK_SITE_KEY as string | undefined;
  if (!siteKey || usingEmulators) return;

  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = (env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined) || true;
  }

  const provider = env.VITE_APPCHECK_PROVIDER === 'enterprise'
    ? new ReCaptchaEnterpriseProvider(siteKey)
    : new ReCaptchaV3Provider(siteKey);
  try {
    initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });
  } catch (e) {
    // Never let App Check stop the portal loading; with enforcement off the
    // requests still go through, and Firebase > App Check shows them as unverified.
    console.error('App Check failed to start', e);
  }
}
