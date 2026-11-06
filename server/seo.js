// Adds the tags search engines and link previews read to every storefront page
// as it's served: a canonical link, Open Graph and Twitter card tags with an
// absolute image, and noindex on pages that shouldn't appear in search.
// Product pages get the product's own name, description and photo, so a shared
// /product?id=... link previews that piece (previews don't run JavaScript).
import fs from 'node:fs';
import { getProduct } from './services.js';

const SITE = () => (process.env.PUBLIC_SITE_URL || 'https://axiajewellery.com').trim().replace(/\/$/, '');
const DEFAULT_IMAGE = 'assets/img/products/two-row-flat-cuban-chain-12mm/silver/1.jpg';
const PAGE_IMAGE = {
  collection: 'assets/img/shopall-hero.jpg',
  titans: 'assets/img/products/the-titan/1.jpg',
  about: 'assets/img/packaging/case-lifestyle.jpg',
};
const NOINDEX = new Set(['checkout', 'unsubscribe', 'styleguide']);

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const unesc = v => String(v).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const abs = src => (/^https?:\/\//.test(src) ? src : `${SITE()}/${String(src).replace(/^\//, '')}`);

// Page files are read once and kept, keyed by modification time.
const files = new Map();
function readPage(file) {
  const mtime = fs.statSync(file).mtimeMs;
  const hit = files.get(file);
  if (hit && hit.mtime === mtime) return hit.html;
  const html = fs.readFileSync(file, 'utf8');
  files.set(file, { mtime, html });
  return html;
}

// Product details for previews, cached for a minute.
const products = new Map();
async function productMeta(id) {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(id || '')) return null;
  const hit = products.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  let p = null;
  try {
    const d = await getProduct(id);
    if (d && !d.archived && !d.hidden) p = { name: d.name, description: d.desc || d.description || '', image: (d.images || [])[0] || (d.widths && d.widths[0] && d.widths[0].image) || '' };
  } catch (err) { console.error('seo: product read failed', err.message); }
  if (products.size > 500) products.clear();
  products.set(id, { p, at: Date.now() });
  return p;
}

/**
 * The page's HTML with its head tags filled in.
 * @param {string} file  the .html file
 * @param {string} page  page name ('index', 'product', ...)
 * @param {string} urlPath  the path it was asked for ('/', '/collection', ...)
 * @param {object} query  the request's query
 */
export async function renderPage(file, page, urlPath, query) {
  let html = readPage(file);
  if (html.includes('rel="canonical"')) return html; // redirect pages (shop, atlas, cross) set their own
  let title = unesc((/<title>([^<]*)<\/title>/.exec(html) || [])[1] || 'AXIA');
  let desc = unesc((/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || '');
  let image = PAGE_IMAGE[page] || DEFAULT_IMAGE;
  let canonical = `${SITE()}${urlPath === '/' ? '/' : urlPath}`;
  let type = 'website';

  if (page === 'product' && query && typeof query.id === 'string') {
    const p = await productMeta(query.id);
    if (p) {
      title = `${p.name} | AXIA`;
      if (p.description) desc = p.description.length > 200 ? p.description.slice(0, 197).replace(/\s+\S*$/, '') + '…' : p.description;
      if (p.image) image = p.image;
      canonical = `${SITE()}/product?id=${encodeURIComponent(query.id)}`;
      type = 'product';
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
    }
  }

  const tags = [
    `<link rel="canonical" href="${esc(canonical)}">`,
    NOINDEX.has(page) && !html.includes('name="robots"') ? '<meta name="robots" content="noindex">' : '',
    `<meta property="og:site_name" content="AXIA">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:title" content="${esc(title.replace(/ \| AXIA$/, '').replace(/^AXIA \| /, 'AXIA: '))}">`,
    desc ? `<meta property="og:description" content="${esc(desc)}">` : '',
    `<meta property="og:image" content="${esc(abs(image))}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].filter(Boolean).join('\n');
  return html.replace('</head>', `${tags}\n</head>`);
}
