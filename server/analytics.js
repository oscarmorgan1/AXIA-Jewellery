// Google Analytics 4 (the Firebase project's GA4 property), Microsoft Clarity and
// the Meta Pixel on the public storefront only. Never on /admin, /portal or unsubscribe.
//
// The IDs come from App Hosting (apphosting.yaml). Leave one unset and that
// tool stays off: no script, and its hosts stay out of the page's CSP.
//   GA_MEASUREMENT_ID   G-XXXXXXXXXX  (Firebase > Project settings > Integrations > Google Analytics)
//   CLARITY_PROJECT_ID  the 10-ish character id in the Clarity tracking code
//   META_PIXEL_ID       the 15-16 digit dataset (pixel) id from Meta Events Manager
//   ANALYTICS_CONSENT   "notice" (default): runs unless the visitor declines.
//                       "opt-in": nothing loads until they tap OK.
//
// The browser side (consent notice, masking, loading) is assets/js/analytics.js.

const GA = /^G-[A-Z0-9]{4,16}$/;
const CLARITY = /^[a-z0-9]{6,16}$/;
const META = /^[0-9]{8,20}$/;

// Pages that never get analytics: Stripe's return page (session id in the URL),
// the unsubscribe page (signed token in the URL), and the internal style guide.
const OFF_PAGES = new Set(['checkout', 'unsubscribe', 'styleguide']);
// No session recordings where the URL carries a piece's serial (/genuine?serial=...).
// GA still counts the page, with the serial stripped from the URL it sees.
const NO_CLARITY = new Set(['genuine']);
// The Meta Pixel sends Meta the full page address, which can't be cleaned the
// way GA's is, so it stays off /genuine (serials). It does run on /checkout,
// for InitiateCheckout and Purchase: the confirmation step takes Stripe's
// session id out of the address before the pixel loads (checkout.html).
const META_PAGES_OFF = new Set(['genuine', 'unsubscribe', 'styleguide']);

export function analyticsConfig() {
  const ga = (process.env.GA_MEASUREMENT_ID || '').trim().toUpperCase();
  const clarity = (process.env.CLARITY_PROJECT_ID || '').trim().toLowerCase();
  const meta = (process.env.META_PIXEL_ID || '').trim();
  return {
    ga: GA.test(ga) ? ga : '',
    clarity: CLARITY.test(clarity) ? clarity : '',
    meta: META.test(meta) ? meta : '',
    consent: (process.env.ANALYTICS_CONSENT || '').trim() === 'opt-in' ? 'opt-in' : 'notice',
  };
}

/** The config for this storefront page, or null when it gets no analytics. */
export function analyticsFor(page) {
  const c = analyticsConfig();
  if (OFF_PAGES.has(page)) { c.ga = ''; c.clarity = ''; }
  if (NO_CLARITY.has(page)) c.clarity = '';
  if (META_PAGES_OFF.has(page)) c.meta = '';
  return c.ga || c.clarity || c.meta ? c : null;
}

/** The one <script> tag the page needs (the server adds its nonce). */
export function analyticsTag(c) {
  const attr = [c.ga && `data-ga="${c.ga}"`, c.clarity && `data-clarity="${c.clarity}"`, c.meta && `data-meta="${c.meta}"`, `data-consent="${c.consent}"`].filter(Boolean).join(' ');
  return `<script src="/assets/js/analytics.js?v=20261126a" ${attr} defer></script>`;
}
