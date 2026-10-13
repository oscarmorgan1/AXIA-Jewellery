// Serves the storefront and the built admin portal the way firebase.json did:
// clean URLs (/collection serves collection.html, /collection.html redirects),
// /admin/** falls back to the portal's index.html, and the same cache headers.
//
// Only the root .html pages, assets/ and admin/ are served. Everything else in
// the repo (package.json, scripts/, server/, rules, private/) is never sent.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

const NO_CACHE = 'no-cache';
const WEEK = 'public, max-age=604800';
const YEAR = 'public, max-age=31536000, immutable';
const MEDIA = /\.(jpe?g|png|webp|mp4|svg)$/i;

export function staticSite(root) {
  const router = express.Router();
  const pages = new Set(fs.readdirSync(root).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5)));
  const adminDir = path.join(root, 'admin');
  const sendPage = (res, file) => res.set('Cache-Control', NO_CACHE).sendFile(file);

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

  router.get('/{*page}', (req, res, next) => {
    const qs = req.originalUrl.slice(req.path.length);
    const m = req.path.match(/^\/([\w-]+)(\.html)?$/);
    if (req.path === '/') return sendPage(res, path.join(root, 'index.html'));
    if (!m || !pages.has(m[1])) return next();
    if (m[2]) return res.redirect(301, (m[1] === 'index' ? '/' : '/' + m[1]) + qs);
    if (m[1] === 'index') return res.redirect(301, '/' + qs);
    sendPage(res, path.join(root, m[1] + '.html'));
  });

  return router;
}
