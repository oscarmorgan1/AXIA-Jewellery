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

const NO_CACHE = 'no-cache';
const WEEK = 'public, max-age=604800';
const YEAR = 'public, max-age=31536000, immutable';
const MEDIA = /\.(jpe?g|png|webp|mp4|svg)$/i;

// The Open shop switch decides where the front door goes: open, / goes to the
// store; closed, /store goes to the waitlist page at /. Cached for a few
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

  // Crawlers ask for these on every visit; answering saves a stream of 404s.
  router.get('/robots.txt', (req, res) => res.set('Cache-Control', WEEK).type('text')
    .send('User-agent: *\nDisallow: /admin\nDisallow: /api/\nDisallow: /checkout\nDisallow: /unsubscribe\n'));
  router.get('/favicon.ico', (req, res) => res.set('Cache-Control', WEEK).redirect(301, '/assets/img/favicon.svg'));

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
    if (req.path === '/') {
      if (await shopOpen()) return sendTo(res, '/store' + qs);
      return sendPage(res, path.join(root, 'index.html'));
    }
    // ?preview lets the owner check the store from the admin portal while it's closed.
    if (m && m[1] === 'store' && !m[2] && !('preview' in req.query) && !(await shopOpen())) return sendTo(res, '/' + qs);
    if (!m || !pages.has(m[1])) return next();
    if (m[2]) return res.redirect(301, (m[1] === 'index' ? '/' : '/' + m[1]) + qs);
    if (m[1] === 'index') return res.redirect(301, '/' + qs);
    sendPage(res, path.join(root, m[1] + '.html'));
  });

  return router;
}
