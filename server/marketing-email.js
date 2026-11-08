// The marketing email layout (Admin > Marketing): a dark hero with the AXIA
// logo and a big photo, an optional countdown-style figure, the message, a
// call to action, a grid of product photos, and a footer with the sender and
// an unsubscribe link (Spam Act: who it's from, why they get it, how to stop).
//
// Built with tables and inline styles so it holds together in Gmail, Apple
// Mail and Outlook. The same function renders the portal's live preview, the
// test send and every real send, so what the admin sees is what goes out.
import { brandUrl } from './email.js';

const C = {
  ink: '#111315', night: '#0b0c0e', soft: '#5c636c', line: '#e6e2d9', bone: '#fbfaf6', page: '#f4f1ea',
  onDark: '#f4f1ea', onDark2: '#aeb4bc', ice: '#c7eaf7', iceInk: '#2a6076',
};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sans = "font-family:'Hanken Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif";
const display = "font-family:'Bricolage Grotesque','Helvetica Neue',Helvetica,Arial,sans-serif";
const aud = n => 'A$' + Number(n || 0).toLocaleString('en-AU', { maximumFractionDigits: 0 });

/** Placeholder swapped for each recipient's own signed unsubscribe link when it's sent. */
export const UNSUBSCRIBE_TOKEN = '%%UNSUBSCRIBE_URL%%';

/** A site path (assets/...) or full URL, as an absolute image address. */
export function imageUrl(src, siteUrl) {
  if (!src) return '';
  if (/^https:\/\//.test(src)) return src;
  return `${siteUrl}/${String(src).replace(/^\/+/, '')}`;
}

/** Only https links, or site paths turned into links on the public site. */
function linkUrl(href) {
  const h = String(href || '').trim();
  if (/^https:\/\//i.test(h)) return h;
  if (/^\/[^/]/.test(h) || h === '/') return `${brandUrl()}${h}`;
  return brandUrl();
}

/** {{first_name}} → their first name, or "there" when we don't have one. */
export function personalise(text, firstName) {
  return String(text || '').replace(/\{\{\s*first_name\s*\}\}/gi, firstName || 'there');
}

const paragraphs = (text, color, size = 16) => String(text || '').trim().split(/\n{2,}/).filter(Boolean)
  .map(t => `<p style="margin:0 0 14px;${sans};font-size:${size}px;line-height:1.65;color:${color}">${esc(t).replace(/\n/g, '<br>')}</p>`).join('');

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px auto 4px"><tr>
    <td align="center" bgcolor="${C.ink}" style="background:${C.ink};border-radius:3px">
      <a href="${esc(href)}" style="display:inline-block;padding:16px 34px;${sans};font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.onDark};text-decoration:none">${esc(label)}</a>
    </td></tr></table>`;
}

function stat(s) {
  if (!s || !String(s.value || '').trim()) return '';
  return `<tr><td align="center" bgcolor="${C.ink}" style="background:${C.ink};padding:30px 24px 34px">
    <p style="margin:0;${display};font-size:72px;line-height:1;font-weight:800;letter-spacing:-.01em;color:${C.onDark}">${esc(s.value)}</p>
    ${s.label ? `<p style="margin:10px 0 0;${sans};font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:${C.ice}">${esc(s.label)}</p>` : ''}
    ${s.note ? `<p style="margin:16px 0 0;${sans};font-size:14px;line-height:1.5;color:${C.onDark2}">${esc(s.note)}</p>` : ''}
  </td></tr>`;
}

function productCell(p, siteUrl) {
  if (!p) return '<td width="50%" style="padding:0 8px"></td>';
  const href = `${brandUrl()}/product?id=${encodeURIComponent(p.id)}`;
  const img = imageUrl(p.image, siteUrl);
  return `<td width="50%" valign="top" style="padding:0 8px 22px">
    <a href="${esc(href)}" style="text-decoration:none;color:${C.ink}">
      ${img ? `<img src="${esc(img)}" width="252" alt="${esc(p.name)}" style="display:block;width:100%;max-width:252px;height:auto;border:0;border-radius:3px;background:${C.page}">` : ''}
      <p style="margin:12px 0 2px;${sans};font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${C.ink}">${esc(p.name)}</p>
      ${p.priceAUD ? `<p style="margin:0;${sans};font-size:13px;color:${C.soft}">From ${aud(p.priceAUD)}</p>` : ''}
    </a></td>`;
}

function productGrid(products, title, siteUrl) {
  if (!products || !products.length) return '';
  const rows = [];
  for (let i = 0; i < products.length; i += 2) rows.push(`<tr>${productCell(products[i], siteUrl)}${productCell(products[i + 1], siteUrl)}</tr>`);
  return `<tr><td bgcolor="${C.bone}" style="background:${C.bone};padding:8px 26px 14px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line}"><tr><td align="center" style="padding:30px 0 22px">
      <p style="margin:0;${sans};font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:${C.soft}">${esc(title || 'The pieces')}</p>
    </td></tr></table>
    <table class="ax-grid" role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>
  </td></tr>`;
}

function perks() {
  const cell = (t, s) => `<td width="33%" align="center" valign="top" style="padding:0 6px">
    <p style="margin:0 0 4px;${sans};font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.ink}">${t}</p>
    <p style="margin:0;${sans};font-size:12px;line-height:1.5;color:${C.soft}">${s}</p></td>`;
  return `<tr><td bgcolor="${C.bone}" style="background:${C.bone};padding:22px 26px 30px;border-top:1px solid ${C.line}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${cell('GRA certified', 'VVS D-colour moissanite that passes a diamond tester')}
      ${cell('Lifetime warranty', 'On manufacturing defects, for as long as you own it')}
      ${cell('30-day exchanges', 'Swap your size or your piece, free')}
    </tr></table></td></tr>`;
}

/**
 * The email for one campaign. `content` is what the admin edits; `products`
 * are the chosen pieces ({ id, name, image, priceAUD }) looked up by the caller.
 * Returns { subject, html, text } with UNSUBSCRIBE_TOKEN where the link goes.
 */
export function marketingEmail(content, { products = [], siteUrl, firstName = '', reason } = {}) {
  const c = content || {};
  const name = String(firstName || '').trim().split(/\s+/)[0];
  const P = t => personalise(t, name);
  const subject = P(c.subject) || 'News from AXIA';
  const hero = imageUrl(c.heroImage, siteUrl);
  const cta = c.ctaLabel && String(c.ctaLabel).trim() ? button(linkUrl(c.ctaUrl), c.ctaLabel) : '';
  const why = reason || 'You’re receiving this because you joined the AXIA waitlist or signed up for news at axiajewellery.com.';
  const link = (href, t) => `<a href="${esc(href)}" style="color:${C.soft};text-decoration:underline">${t}</a>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;700&display=swap" rel="stylesheet">
<style>@media (max-width:620px){.ax-pad{padding-left:20px!important;padding-right:20px!important}.ax-h1{font-size:30px!important}.ax-grid td{padding-left:5px!important;padding-right:5px!important}.ax-grid img{max-width:100%!important}}</style>
</head>
<body style="margin:0;padding:0;background:${C.page}">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all">${esc(P(c.preheader))}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.page}" style="background:${C.page}"><tr><td align="center" style="padding:24px 10px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-radius:6px;overflow:hidden">
  <tr><td align="center" bgcolor="${C.ink}" style="background:${C.ink};padding:30px 24px 26px">
    <a href="${esc(brandUrl())}"><img src="${esc(siteUrl)}/assets/img/email/axia-logo-light.png" width="120" alt="AXIA" style="display:block;width:120px;height:auto;border:0"></a>
    ${c.eyebrow ? `<p style="margin:18px 0 0;${sans};font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:${C.ice}">${esc(P(c.eyebrow))}</p>` : ''}
  </td></tr>
  ${hero ? `<tr><td bgcolor="${C.ink}" style="background:${C.ink};line-height:0"><a href="${esc(linkUrl(c.ctaUrl))}"><img src="${esc(hero)}" width="600" alt="${esc(c.heroAlt || '')}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr>` : ''}
  ${stat(c.stat)}
  <tr><td class="ax-pad" align="center" bgcolor="${C.bone}" style="background:${C.bone};padding:42px 46px 34px;text-align:center">
    <h1 class="ax-h1" style="margin:0 0 18px;${display};font-size:36px;line-height:1.08;font-weight:800;letter-spacing:-.005em;text-transform:uppercase;color:${C.ink}">${esc(P(c.heading))}</h1>
    ${paragraphs(P(c.body), C.ink)}
    ${cta}
    ${c.footnote ? `<p style="margin:18px 0 0;${sans};font-size:13px;line-height:1.55;color:${C.soft}">${esc(P(c.footnote))}</p>` : ''}
  </td></tr>
  ${productGrid(products, c.productsTitle, siteUrl)}
  ${perks()}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px"><tr><td align="center" style="padding:26px 20px 0;${sans};font-size:11px;line-height:1.7;color:${C.soft}">
  ${link(`${brandUrl()}/shop`, 'Shop')} &nbsp;·&nbsp; ${link(`${brandUrl()}/support`, 'Help centre')} &nbsp;·&nbsp; ${link(`${brandUrl()}/genuine`, 'Verify a piece')}<br>
  ${esc(why)}<br>
  Sent by AXIA Jewellery, axiajewellery.com. Replies reach our team.<br>
  <a href="${UNSUBSCRIBE_TOKEN}" style="color:${C.ink};font-weight:700;text-decoration:underline">Unsubscribe</a> from AXIA news and offers in one click.
</td></tr></table>
</td></tr></table></body></html>`;

  const text = [
    P(c.heading),
    c.stat && c.stat.value ? [c.stat.value, c.stat.label, c.stat.note].filter(Boolean).join(' · ') : '',
    P(c.body),
    c.ctaLabel ? `${c.ctaLabel}: ${linkUrl(c.ctaUrl)}` : '',
    products.length ? products.map(p => `${p.name}${p.priceAUD ? ` (from ${aud(p.priceAUD)})` : ''}: ${brandUrl()}/product?id=${encodeURIComponent(p.id)}`).join('\n') : '',
    c.footnote ? P(c.footnote) : '',
    `${why}\nSent by AXIA Jewellery, axiajewellery.com.\nUnsubscribe: ${UNSUBSCRIBE_TOKEN}`,
  ].filter(Boolean).join('\n\n');

  return { subject, html, text };
}
