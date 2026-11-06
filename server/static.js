// Serves the storefront and the built admin portal the way firebase.json did:
// clean URLs (/collection serves collection.html, /collection.html redirects),
// /admin/** falls back to the portal's index.html, and the same cache headers.
//
// Only the root .html pages, assets/ and admin/ are served. Everything else in
// the repo (package.json, scripts/, server/, rules, private/) is never sent.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { isShopOpen } from './services.js';
import { renderPage } from './seo.js';

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

export function staticSite(root) {
  const router = express.Router();
  const pages = new Set(fs.readdirSync(root).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5)));
  const adminDir = path.join(root, 'admin');
  const sendPage = (res, file) => res.set('Cache-Control', NO_CACHE).sendFile(file);
  // Storefront pages go out with their canonical, preview and robots tags (seo.js).
  const sendSitePage = async (req, res, name) => {
    const html = await renderPage(path.join(root, name + '.html'), name, req.path === '/' ? '/' : '/' + name, req.query);
    res.set('Cache-Control', NO_CACHE).type('html').send(html);
  };

  // Crawlers ask for these on every visit; answering saves a stream of 404s.
  router.get('/robots.txt', (req, res) => res.set('Cache-Control', WEEK).type('text')
    .send('User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /checkout\nDisallow: /unsubscribe\nDisallow: /styleguide\n'));
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

  router.use('/admin', (req, res, next) => { res.set('X-Robots-Tag', 'noindex'); next(); });
  router.use('/admin/assets', express.static(path.join(adminDir, 'assets'), {
    index: false, redirect: false, dotfiles: 'ignore', fallthrough: false,
    setHeaders: res => res.set('Cache-Control', YEAR),
  }));
  router.use('/admin', express.static(adminDir, {
    index: false, redirect: false, dotfiles: 'ignore',
    setHeaders: (res, file) => res.set('Cache-Control', MEDIA.test(file) ? WEEK : NO_CACHE),
  }));
  router.get(['/admin', '/admin/{*rest}'], (req, res, next) => {
    const index = path.join(adminDir, 'index.html');
    if (!fs.existsSync(index)) return next(); // portal not built (run `npm run build`)
    sendPage(res, index);
  });

  // Temporary (302) and uncached, so flipping the switch takes effect at once.
  const sendTo = (res, url) => res.set('Cache-Control', 'no-store').redirect(302, url);

  router.get('/{*page}', async (req, res, next) => {
    const qs = req.originalUrl.slice(req.path.length);
    const m = req.path.match(/^\/([\w-]+)(\.html)?$/);
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
