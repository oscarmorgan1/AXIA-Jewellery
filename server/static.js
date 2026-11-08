// Serves the storefront and the built admin portal the way firebase.json did:
// clean URLs (/collection serves collection.html, /collection.html redirects),
// /admin/** and /portal/** fall back to their app's index.html, and the same cache headers.
//
// Only the root .html pages, assets/, admin/ and portal/ are served. Everything else in
// the repo (package.json, scripts/, server/, rules, private/) is never sent.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { getSiteMode, isShopOpen } from './services.js';
import { renderPage } from './seo.js';
import { withNonce } from './csp.js';

const NO_CACHE = 'no-cache';
const WEEK = 'public, max-age=604800';
const YEAR = 'public, max-age=31536000, immutable';
const MEDIA = /\.(jpe?g|png|webp|mp4|svg)$/i;

// The Open shop switch decides what the main address shows: open, / is the
// store (and /store sends people there); closed, / is the waitlist page. Cached for a few
// seconds so every visit isn't a Firestore read; if Firestore can't be
// reached the site acts closed, matching checkout.
const SHOP_TTL = 10_000;
let shop = { open: false, at: 0 };
async function shopOpen() {
  if (Date.now() - shop.at < SHOP_TTL) return shop.open;
  try { shop = { open: await isShopOpen(), at: Date.now() }; }
  catch (e) { console.error('shop switch read failed', e); shop = { open: false, at: Date.now() }; }
  return shop.open;
}

// The Site mode switch: in maintenance every storefront page shows maintenance.html
// ("AXIA is unavailable"), offline shows offline.html ("AXIA is offline"), both
// with a 503. The admin portal, /api and assets keep working. Cached the same
// way; if Firestore can't be reached the site stays up (production).
const DOWN_PAGE = { maintenance: 'maintenance.html', offline: 'offline.html' };
let mode = { value: 'production', at: 0 };
export async function siteMode() {
  if (Date.now() - mode.at < SHOP_TTL) return mode.value;
  try { mode = { value: await getSiteMode(), at: Date.now() }; }
  catch (e) { console.error('site mode read failed', e); mode = { value: 'production', at: Date.now() }; }
  return mode.value;
}
// Still reachable while the site is down: unsubscribing from emails must always work.
const WHILE_DOWN = new Set(['unsubscribe']);

export function staticSite(root) {
  const router = express.Router();
  // maintenance.html and offline.html are only ever sent by the switch below, never as pages.
  const pages = new Set(fs.readdirSync(root).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5)).filter(p => p !== 'maintenance' && p !== 'offline'));
  // Every page goes out with this response's CSP nonce on its <script> tags (csp.js).
  const sendPage = (res, file) => res.set('Cache-Control', NO_CACHE).type('html').send(withNonce(fs.readFileSync(file, 'utf8'), res.locals.nonce));
  // Storefront pages go out with their canonical, preview and robots tags (seo.js).
  const sendSitePage = async (req, res, name) => {
    const html = await renderPage(path.join(root, name + '.html'), name, req.path === '/' ? '/' : '/' + name, req.query);
    res.set('Cache-Control', NO_CACHE).type('html').send(withNonce(html, res.locals.nonce));
  };

  // Crawlers ask for these on every visit; answering saves a stream of 404s.
  router.get('/robots.txt', (req, res) => res.set('Cache-Control', WEEK).type('text')
    .send('User-agent: *\nDisallow: /admin\nDisallow: /portal\nDisallow: /api/\nDisallow: /checkout\nDisallow: /unsubscribe\nDisallow: /styleguide\n'));
  router.get('/favicon.ico', (req, res) => res.set('Cache-Control', WEEK).redirect(301, '/assets/img/favicon.svg'));

  // Web-sized photos (scripts/images.mjs). If a WebP version hasn't been made
  // for a photo yet, serve the original instead of a broken image.
  router.get(/^\/assets\/img\/(.+)-(600|1200)\.webp$/, (req, res, next) => {
    const want = path.join(root, decodeURIComponent(req.path));
    if (!want.startsWith(path.join(root, 'assets', 'img') + path.sep) || fs.existsSync(want)) return next();
    const base = want.replace(/-(600|1200)\.webp$/, '');
    const original = ['.jpg', '.jpeg', '.png'].map(x => base + x).find(f => fs.existsSync(f));
    if (!original) return next();
    res.set('Cache-Control', NO_CACHE).sendFile(original);
  });

  router.use('/assets', express.static(path.join(root, 'assets'), {
    index: false, redirect: false, dotfiles: 'ignore',
    setHeaders: (res, file) => res.set('Cache-Control', MEDIA.test(file) ? WEEK : NO_CACHE),
  }));

  // The admin portal (/admin) and the customer portal (/portal) are single-page
  // apps built by admin-portal/: hashed assets cached for a year, and every other
  // path under them falls back to their index.html. Neither is indexed.
  for (const app of ['admin', 'portal']) {
    const dir = path.join(root, app);
    router.use(`/${app}`, (req, res, next) => { res.set('X-Robots-Tag', 'noindex'); next(); });
    router.use(`/${app}/assets`, express.static(path.join(dir, 'assets'), {
      index: false, redirect: false, dotfiles: 'ignore', fallthrough: false,
      setHeaders: res => res.set('Cache-Control', YEAR),
    }));
    router.use(`/${app}`, express.static(dir, {
      index: false, redirect: false, dotfiles: 'ignore',
      setHeaders: (res, file) => res.set('Cache-Control', MEDIA.test(file) ? WEEK : NO_CACHE),
    }));
    router.get([`/${app}`, `/${app}/{*rest}`], (req, res, next) => {
      const index = path.join(dir, 'index.html');
      if (!fs.existsSync(index)) return next(); // not built (run `npm run build`)
      sendPage(res, index);
    });
  }

  // Temporary (302) and uncached, so flipping the switch takes effect at once.
  const sendTo = (res, url) => res.set('Cache-Control', 'no-store').redirect(302, url);

  router.get('/{*page}', async (req, res, next) => {
    const qs = req.originalUrl.slice(req.path.length);
    const m = req.path.match(/^\/([\w-]+)(\.html)?$/);
    const down = DOWN_PAGE[await siteMode()];
    if (down && !(m && WHILE_DOWN.has(m[1]))) {
      return res.status(503).set({ 'Cache-Control': 'no-store', 'Retry-After': '600', 'X-Robots-Tag': 'noindex' })
        .sendFile(path.join(root, down));
    }
    if (req.path === '/') return sendSitePage(req, res, (await shopOpen()) ? 'store' : 'index');
    // Open, the store lives at the main address, so /store goes there. Closed, /store stays reachable.
    if (m && m[1] === 'store' && !m[2] && (await shopOpen())) return sendTo(res, '/' + qs);
    if (!m || !pages.has(m[1])) return next();
    if (m[2]) return res.redirect(301, (m[1] === 'index' ? '/' : '/' + m[1]) + qs);
    if (m[1] === 'index') return res.redirect(301, '/' + qs);
    sendSitePage(req, res, m[1]).catch(next);
  });

  return router;
}
