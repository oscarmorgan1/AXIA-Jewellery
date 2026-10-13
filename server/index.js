// The AXIA web server, run by Firebase App Hosting (`npm start`).
// Serves the storefront and admin portal, plus the checkout and admin APIs.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { staticSite } from './static.js';
import { checkoutRoutes } from './checkout.js';
import { webhookRoutes } from './webhook.js';
import { adminRoutes } from './admin.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // App Hosting sits behind Google's load balancer

app.use(webhookRoutes()); // before any JSON parsing: Stripe signs the raw body
app.use(checkoutRoutes());
app.use(adminRoutes());
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(staticSite(root));
app.use((req, res) => res.status(404).type('text').send('Not found'));
app.use((err, req, res, next) => { // bad JSON, oversized bodies and anything unexpected
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.status && err.status < 500 ? 'Bad request' : 'Server error' });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => console.log(`AXIA listening on http://localhost:${port}`));
