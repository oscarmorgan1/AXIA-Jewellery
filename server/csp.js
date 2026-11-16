// The Content-Security-Policy on every response, with a fresh nonce per request.
//
// Scripts: only files from this site, the Google hosts Firebase Auth and
// reCAPTCHA (App Check) load, and inline <script> blocks carrying this
// response's nonce. The server adds the nonce to every <script> in the pages
// it sends (withNonce below); there are no inline event handlers (onclick=...),
// which a nonce can't cover. So an injected script, or an injected onclick,
// doesn't run, and can't use the portals' signed-in Firebase session.
//
// connect-src lists everywhere the pages may send data: this site (/api), and
// the Firebase services the portals use. Anything else (an attacker's server)
// is refused, so even a script that did run couldn't send a token out.
//
// If something stops loading after a change, the browser console names the
// blocked URL and the directive: add the host to that list, nothing wider.
import crypto from 'node:crypto';

const SITE = () => (process.env.PUBLIC_SITE_URL || 'https://axiajewellery.com').trim().replace(/\/$/, '');
const EMULATING = () => !!(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
// npm run serve: the portals talk to the local emulators (firebase.json ports).
const EMULATORS = ['http://127.0.0.1:8080', 'http://127.0.0.1:9099', 'http://127.0.0.1:9199', 'http://localhost:8080', 'http://localhost:9099', 'http://localhost:9199', 'http://127.0.0.1:5000'];

const FIREBASE_API = [
  'https://firestore.googleapis.com',          // Firestore (portals)
  'https://identitytoolkit.googleapis.com',    // Firebase Auth sign-in
  'https://securetoken.googleapis.com',        // Firebase Auth token refresh
  'https://firebasestorage.googleapis.com',    // portal uploads, and media served from Storage
  'https://content-firebaseappcheck.googleapis.com', // App Check token exchange
  'https://firebaseappcheck.googleapis.com',
];
const RECAPTCHA = ['https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/', 'https://recaptcha.google.com/recaptcha/'];
const AUTH_FRAME = 'https://axia-jewellery.firebaseapp.com'; // Firebase Auth's helper iframe and Google sign-in (authDomain)
// The admin portal's offline page (admin-portal/public/offline.html) is a static file the
// service worker keeps, so it can't be given a nonce: its one inline line is allowed by hash.
// Change that line and this hash must change too (tests/csp.test.mjs checks it).
export const OFFLINE_SCRIPT_HASH = "'sha256-8IHwa3lfXd7uocWGn33L6hrcY0R9mZSRYd2K9Xfn+Mc='";
const STORAGE_MEDIA = ['https://firebasestorage.googleapis.com', 'https://storage.googleapis.com'];

// Analytics, added only to storefront pages that load it (server/analytics.js),
// and only for the tool that's configured. /admin, /portal and /api never get these.
// GA4: gtag.js, and the collection endpoints it posts to (region1 is the one
// Google routes most traffic through). Clarity: its tag and script, and
// uploads to a numbered/lettered *.clarity.ms host Microsoft picks per project,
// so that one is a wildcard on clarity.ms only.
export const GA_HOSTS = {
  script: ['https://www.googletagmanager.com'],
  connect: ['https://www.google-analytics.com', 'https://region1.google-analytics.com', 'https://analytics.google.com', 'https://region1.analytics.google.com', 'https://www.googletagmanager.com'],
  img: ['https://www.google-analytics.com', 'https://www.googletagmanager.com'],
};
export const CLARITY_HOSTS = {
  script: ['https://www.clarity.ms', 'https://scripts.clarity.ms'],
  connect: ['https://*.clarity.ms'],
  img: ['https://*.clarity.ms'],
};

/**
 * The policy for one response.
 * @param {string} nonce
 * @param {{ga?: string, clarity?: string}|null} analytics  the page's analytics (storefront pages only)
 */
export function policy(nonce, analytics = null) {
  const extra = [analytics && analytics.ga && GA_HOSTS, analytics && analytics.clarity && CLARITY_HOSTS].filter(Boolean);
  const more = k => extra.flatMap(h => h[k]);
  const dev = EMULATING() ? EMULATORS : [];
  const site = SITE();
  const d = {
    'default-src': ["'self'"],
    // The same hosts as before the nonce (proven with Google sign-in and App Check), minus 'unsafe-inline'.
    'script-src': ["'self'", `'nonce-${nonce}'`, OFFLINE_SCRIPT_HASH, 'https://apis.google.com', 'https://www.gstatic.com', 'https://*.firebaseapp.com', ...RECAPTCHA, ...more('script')],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    // Google profile photos (portal), reCAPTCHA images, Storage uploads, and the
    // live site's absolute image links in email previews.
    'img-src': ["'self'", 'data:', 'blob:', site, ...STORAGE_MEDIA, 'https://*.googleusercontent.com', 'https://www.gstatic.com', 'https://www.google.com', ...more('img'), ...dev],
    'media-src': ["'self'", 'blob:', site, ...STORAGE_MEDIA, ...dev],
    'connect-src': ["'self'", ...FIREBASE_API, 'https://www.google.com/recaptcha/', 'https://apis.google.com', ...more('connect'), ...dev],
    'frame-src': ["'self'", AUTH_FRAME, ...RECAPTCHA],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'frame-ancestors': ["'self'"],
    // Blocked loads are logged on the server (POST /api/csp-report), so a host
    // missing from a list shows up in the App Hosting logs, not just one browser's console.
    'report-uri': ['/api/csp-report'],
  };
  return Object.entries(d).map(([k, v]) => `${k} ${[...new Set(v)].join(' ')}`).join('; ');
}

/** Sets a nonce for this response (res.locals.nonce) and its CSP header. */
export function cspMiddleware(req, res, next) {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce;
  res.set('Content-Security-Policy', policy(nonce));
  next();
}

/** Widens this response's CSP for the analytics a storefront page loads. */
export function allowAnalytics(res, analytics) {
  if (analytics) res.set('Content-Security-Policy', policy(res.locals.nonce, analytics));
}

/** The page with this response's nonce on every <script> tag. */
export function withNonce(html, nonce) {
  return String(html).replace(/<script(?=[\s>])(?![^>]*\snonce=)/gi, `<script nonce="${nonce}"`);
}

/** POST /api/csp-report: logs what browsers blocked (a few per minute per instance). */
export function cspReportRoutes(express, rateLimit) {
  const router = express.Router();
  const tooMany = rateLimit({ windowMs: 60 * 1000, max: 20, maxKeys: 1 });
  router.post('/api/csp-report', express.json({ type: ['application/csp-report', 'application/json', 'application/reports+json'], limit: '16kb' }), (req, res) => {
    if (!tooMany('all')) {
      const r = (req.body && req.body['csp-report']) || req.body || {};
      const one = Array.isArray(r) ? (r[0] && r[0].body) || {} : r;
      const s = v => String(v == null ? '' : v).slice(0, 300);
      console.warn('csp: blocked', JSON.stringify({
        directive: s(one['violated-directive'] || one.effectiveDirective || one['effective-directive']),
        blocked: s(one['blocked-uri'] || one.blockedURL),
        page: s(one['document-uri'] || one.documentURL).replace(/\?.*$/, ''),
        source: s(one['source-file'] || one.sourceFile), line: one['line-number'] || one.lineNumber || null,
      }));
    }
    res.status(204).end();
  });
  return router;
}
