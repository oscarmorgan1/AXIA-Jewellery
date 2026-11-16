// Google Analytics 4 (the Firebase project's GA4 property) and Microsoft Clarity
// on the public storefront only. Never on /admin, /portal, checkout or unsubscribe.
//
// Both IDs come from App Hosting (apphosting.yaml). Leave one unset and that
// tool stays off: no script, and its hosts stay out of the page's CSP.
//   GA_MEASUREMENT_ID   G-XXXXXXXXXX  (Firebase > Project settings > Integrations > Google Analytics)
//   CLARITY_PROJECT_ID  the 10-ish character id in the Clarity tracking code
//   ANALYTICS_CONSENT   "notice" (default): runs unless the visitor declines.
//                       "opt-in": nothing loads until they tap OK.
//
// The browser side (consent notice, masking, loading) is assets/js/analytics.js.

const GA = /^G-[A-Z0-9]{4,16}$/;
const CLARITY = /^[a-z0-9]{6,16}$/;

// Pages that never get analytics: Stripe's return page (session id in the URL),
// the unsubscribe page (signed token in the URL), and the internal style guide.
const OFF_PAGES = new Set(['checkout', 'unsubscribe', 'styleguide']);
// No session recordings where the URL carries a piece's serial (/genuine?serial=...).
// GA still counts the page, with the serial stripped from the URL it sees.
const NO_CLARITY = new Set(['genuine']);

export function analyticsConfig() {
  const ga = (process.env.GA_MEASUREMENT_ID || '').trim().toUpperCase();
  const clarity = (process.env.CLARITY_PROJECT_ID || '').trim().toLowerCase();
  return {
    ga: GA.test(ga) ? ga : '',
    clarity: CLARITY.test(clarity) ? clarity : '',
    consent: (process.env.ANALYTICS_CONSENT || '').trim() === 'opt-in' ? 'opt-in' : 'notice',
  };
}

/** The config for this storefront page, or null when it gets no analytics. */
export function analyticsFor(page) {
  if (OFF_PAGES.has(page)) return null;
  const c = analyticsConfig();
  if (NO_CLARITY.has(page)) c.clarity = '';
  return c.ga || c.clarity ? c : null;
}

/** The one <script> tag the page needs (the server adds its nonce). */
export function analyticsTag(c) {
  const attr = [c.ga && `data-ga="${c.ga}"`, c.clarity && `data-clarity="${c.clarity}"`, `data-consent="${c.consent}"`].filter(Boolean).join(' ');
  return `<script src="/assets/js/analytics.js?v=20261116a" ${attr} defer></script>`;
}
