// The AXIA web server, run by Firebase App Hosting (`npm start`).
// Serves the storefront and admin portal, plus the checkout and admin APIs.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { staticSite } from './static.js';
import { checkoutRoutes } from './checkout.js';
import { webhookRoutes } from './webhook.js';
import { adminRoutes } from './admin.js';
import { twoFactorRoutes } from './twofactor.js';
import { signupRoutes } from './signup.js';
import { unsubscribeRoutes } from './unsubscribe.js';
import { publicFormRoutes } from './forms.js';
import { genuineRoutes } from './genuine.js';
import { accountRoutes } from './account.js';
import { transferRoutes, sweepExpiredTransfers } from './transfers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.disable('x-powered-by');
// App Hosting sits behind Google's load balancer (used for req.protocol). Rate
// limits don't use req.ip, which a forged X-Forwarded-For can set: see clientIp() in limit.js.
app.set('trust proxy', true);

// Browser hardening on every response: no MIME sniffing, no framing by other
// sites (clickjacking), HTTPS only, and no referrer leaking full URLs (order ids).
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    // Scripts only from this site (inline ones included, the pages rely on them)
    // and Google's sign-in scripts for the portal's Google button.
    'Content-Security-Policy': "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; "
      + "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://*.firebaseapp.com",
    'Strict-Transport-Security': 'max-age=31536000',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});

app.use(webhookRoutes()); // before any JSON parsing: Stripe signs the raw body
app.use(checkoutRoutes());
app.use(twoFactorRoutes());
app.use(adminRoutes());
app.use(signupRoutes());
app.use(unsubscribeRoutes());
app.use(publicFormRoutes());
app.use(genuineRoutes());
app.use(accountRoutes());
app.use(transferRoutes());
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(staticSite(root));
// Unknown URLs: browsers get the styled 404 page, everything else (missing images, scripts) a plain one.
app.use((req, res) => {
  res.status(404);
  if (req.method === 'GET' && req.accepts(['html', 'text']) === 'html') {
    return res.set('Cache-Control', 'no-cache').sendFile(path.join(root, '404.html'));
  }
  res.type('text').send('Not found');
});
app.use((err, req, res, next) => { // bad JSON, oversized bodies and anything unexpected
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.status && err.status < 500 ? 'Bad request' : 'Server error' });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => console.log(`AXIA listening on http://localhost:${port}`));

// Piece transfers run out after 14 days. Signing in settles a customer's own as
// well, so an instance that sleeps through this still never shows a stale offer.
setTimeout(sweepExpiredTransfers, 30 * 1000).unref();
setInterval(sweepExpiredTransfers, 6 * 60 * 60 * 1000).unref();
