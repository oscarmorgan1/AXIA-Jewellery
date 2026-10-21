// Customer emails, sent through Resend: the order confirmation and an email
// for each status change made in the admin portal. Every send returns the
// Resend email id, which the caller stores on the order.
import { resend } from './services.js';
import { unsubscribeUrl } from './unsubscribe.js';

const C = { ink: '#111315', soft: '#5b5e63', line: '#e6e2d9', bone: '#fbfaf6', page: '#f4f1ea', ice: '#2a6076', iceBg: '#eef6f9', accent: '#f3436e' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const aud = n => 'A$' + Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
// Links in emails always point at the public site, whatever address the server
// is reached on (e.g. the temporary hosted.app URL). Images still load from the
// serving address, so they work before and after the domain cutover.
export const brandUrl = () => (process.env.EMAIL_LINK_URL || 'https://axiajewellery.com').trim().replace(/\/$/, '');

const font = "font-family:'Helvetica Neue',Helvetica,Arial,sans-serif";

/** The stages a customer sees, in order. */
const STAGES = [
  { key: 'paid', label: 'Ordered' },
  { key: 'in_progress', label: 'Being made' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'fulfilled', label: 'Delivered' },
];

export const STATUS_EMAILS = {
  in_progress: {
    subject: n => `Your AXIA piece is being made (#${n})`,
    heading: 'Your piece is being made',
    intro: 'Our setters have started on your order. Every stone is set by hand, so this is the longest part of the journey. We’ll email you again the moment it ships.',
  },
  shipped: {
    subject: n => `Your AXIA order has shipped (#${n})`,
    heading: 'Your order is on its way',
    intro: 'Your piece has passed its final quality check and is on its way to you in its AXIA box.',
  },
  fulfilled: {
    subject: n => `Your AXIA order has been delivered (#${n})`,
    heading: 'Delivered. Wear it well.',
    intro: 'Your order has been delivered. We hope it was worth the wait. If anything isn’t right, reply to this email and we’ll look after you.',
  },
  cancelled: {
    subject: n => `Your AXIA order has been cancelled (#${n})`,
    heading: 'Your order has been cancelled',
    intro: 'Your order has been cancelled. If you paid, your refund goes back to your original payment method, usually within 5 to 10 business days. If you didn’t expect this, reply to this email and we’ll sort it out.',
  },
};

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px"><tr><td style="background:${C.ink};border-radius:4px"><a href="${esc(href)}" style="display:inline-block;padding:13px 26px;${font};font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#ffffff;text-decoration:none">${esc(label)}</a></td></tr></table>`;
}

function sectionTitle(t) {
  return `<p style="margin:28px 0 10px;${font};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${C.soft}">${esc(t)}</p>`;
}

function progress(status) {
  const at = STAGES.findIndex(s => s.key === status);
  if (at < 0) return '';
  const cells = STAGES.map((s, i) => {
    const done = i <= at;
    return `<td width="25%" style="padding:0 3px;vertical-align:top">
      <div style="height:4px;border-radius:2px;background:${done ? C.ice : C.line}"></div>
      <p style="margin:8px 0 0;${font};font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${done ? C.ink : C.soft};${i === at ? 'font-weight:700;' : ''}">${s.label}</p></td>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr>${cells}</tr></table>`;
}

function itemsTable(order, siteUrl) {
  const rows = order.items.map(i => {
    const img = i.image ? (/^https?:/.test(i.image) ? i.image : `${siteUrl}/${i.image}`) : '';
    return `<tr>
      <td width="72" style="padding:14px 14px 14px 0;border-bottom:1px solid ${C.line};vertical-align:top">${img ? `<img src="${esc(img)}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:4px;background:${C.page}">` : ''}</td>
      <td style="padding:14px 0;border-bottom:1px solid ${C.line};vertical-align:top;${font};font-size:14px;color:${C.ink}">
        <b>${esc(i.name)}</b>${i.qty > 1 ? ` <span style="color:${C.soft}">× ${i.qty}</span>` : ''}
        ${i.options ? `<br><span style="font-size:13px;color:${C.soft}">${esc(i.options.replace(/ · Engraved: “.*”$/, ''))}</span>` : ''}
        ${i.engraving ? `<br><span style="display:inline-block;margin-top:6px;padding:3px 8px;border-radius:3px;background:${C.iceBg};font-size:12px;color:${C.ice}">Engraving: “${esc(i.engraving)}”</span>` : ''}
      </td>
      <td style="padding:14px 0 14px 12px;border-bottom:1px solid ${C.line};vertical-align:top;text-align:right;white-space:nowrap;${font};font-size:14px;color:${C.ink}">${aud(i.priceAUD * i.qty)}</td></tr>`;
  }).join('');
  const gift = order.gift ? `<tr>
      <td width="72" style="padding:14px 14px 14px 0;border-bottom:1px solid ${C.line}"></td>
      <td style="padding:14px 0;border-bottom:1px solid ${C.line};${font};font-size:14px;color:${C.ink}"><b>${esc(order.gift.name)}</b>${order.gift.length ? `<br><span style="font-size:13px;color:${C.soft}">${esc(order.gift.length)}</span>` : ''}</td>
      <td style="padding:14px 0 14px 12px;border-bottom:1px solid ${C.line};text-align:right;${font};font-size:13px;color:${C.ice};text-transform:uppercase;letter-spacing:.08em">Free gift</td></tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}${gift}</table>`;
}

function totals(order) {
  const row = (l, r, strong) => `<tr><td style="padding:5px 0;${font};font-size:14px;color:${strong ? C.ink : C.soft};${strong ? 'font-weight:700;' : ''}">${l}</td><td style="padding:5px 0;text-align:right;${font};font-size:14px;color:${C.ink};${strong ? 'font-weight:700;' : ''}">${r}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">
    ${row('Subtotal', aud(order.subtotalAUD))}
    ${order.discountAUD ? row('Discount' + (order.promotionCode ? ` (${esc(order.promotionCode)})` : ''), '-' + aud(order.discountAUD)) : ''}
    ${row(esc((order.shipping && order.shipping.method) || 'Shipping'), order.shipping && order.shipping.amountAUD ? aud(order.shipping.amountAUD) : 'Free')}
    <tr><td colspan="2" style="padding-top:8px;border-bottom:1px solid ${C.line}"></td></tr>
    ${row('Total paid (AUD)', aud(order.totalAUD), true)}
  </table>`;
}

function address(order) {
  const a = (order.shipping && order.shipping.address) || {};
  const lines = [order.shipping && order.shipping.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' ')].filter(Boolean).map(esc).join('<br>');
  return lines ? `${sectionTitle('Shipping to')}<p style="margin:0;${font};font-size:14px;line-height:1.6;color:${C.ink}">${lines}</p>` : '';
}

// Replaced with the recipient's own signed link when the email is sent.
const UNSUBSCRIBE = '%%UNSUBSCRIBE_URL%%';

function layout({ siteUrl, preheader, heading, body, reason = 'You’re receiving this email because you placed an order with AXIA.' }) {
  const help = `${brandUrl()}/support`;
  const link = (href, t) => `<a href="${esc(href)}" style="color:${C.ice};text-decoration:underline">${t}</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:32px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
  <tr><td align="center" style="padding:6px 0 24px"><a href="${esc(brandUrl())}"><img src="${esc(siteUrl)}/assets/img/axia-logo.png" alt="AXIA" height="26" style="display:block;height:26px;border:0"></a></td></tr>
  <tr><td style="background:${C.bone};border:1px solid ${C.line};border-radius:6px;padding:36px 34px">
    <h1 style="margin:0 0 12px;${font};font-size:26px;line-height:1.15;letter-spacing:.01em;text-transform:uppercase;color:${C.ink}">${esc(heading)}</h1>
    ${body}
  </td></tr>
  <tr><td style="padding:26px 34px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="33%" style="vertical-align:top;padding-right:10px;${font};font-size:12px;line-height:1.5;color:${C.soft}"><b style="color:${C.ink}">Lifetime warranty</b><br>On manufacturing defects. ${link(`${help}#warranty`, 'Details')}</td>
      <td width="33%" style="vertical-align:top;padding-right:10px;${font};font-size:12px;line-height:1.5;color:${C.soft}"><b style="color:${C.ink}">30-day exchanges</b><br>Swap your size or piece. ${link(`${help}#returns`, 'How it works')}</td>
      <td width="33%" style="vertical-align:top;${font};font-size:12px;line-height:1.5;color:${C.soft}"><b style="color:${C.ink}">Need a hand?</b><br>Reply to this email or visit our ${link(help, 'help centre')}.</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:26px 34px 8px;${font};font-size:11px;line-height:1.6;color:${C.soft};text-align:center">
    ${link(help, 'Help centre')} &nbsp;·&nbsp; ${link(`${help}#shipping`, 'Shipping')} &nbsp;·&nbsp; ${link(`${help}#sizing`, 'Sizing')} &nbsp;·&nbsp; ${link(`${help}#care`, 'Care')}<br>
    Hand-set in 925 sterling silver with VVS D-colour moissanite.<br>
    ${esc(reason)}<br>
    ${link(UNSUBSCRIBE, 'Unsubscribe')} from AXIA news and offers.
  </td></tr>
</table></td></tr></table></body></html>`;
}

const p = (t, color = C.ink) => `<p style="margin:0 0 12px;${font};font-size:15px;line-height:1.6;color:${color}">${t}</p>`;

export function confirmationEmail(order, siteUrl) {
  const first = (order.customer.name || '').split(' ')[0];
  const engraved = order.items.some(i => i.engraving);
  const body = [
    p(`${first ? `Thank you, ${esc(first)}.` : 'Thank you.'} We’ve received your order <b>#${esc(order.orderNumber)}</b> and your payment has gone through.`),
    p('Every AXIA piece is hand-set and made to order, so allow approximately 3 to 5 weeks before it ships. We’ll email you at each step.', C.soft),
    progress('paid'),
    sectionTitle('Your order'),
    itemsTable(order, siteUrl),
    totals(order),
    engraved ? `<div style="margin-top:22px;padding:14px 16px;border-radius:4px;background:${C.iceBg};${font};font-size:13px;line-height:1.55;color:${C.ice}">Your engraving is hand-engraved exactly as shown above. If anything needs changing, reply within 24 hours, before we start.</div>` : '',
    address(order),
    sectionTitle('What happens next'),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${font};font-size:14px;line-height:1.55;color:${C.ink}">
      <tr><td width="26" style="vertical-align:top;color:${C.ice};font-weight:700">1</td><td style="padding-bottom:8px"><b>Made for you.</b> <span style="color:${C.soft}">Our setters hand-set every stone${engraved ? ' and engrave your clasp' : ''}.</span></td></tr>
      <tr><td width="26" style="vertical-align:top;color:${C.ice};font-weight:700">2</td><td style="padding-bottom:8px"><b>Checked and boxed.</b> <span style="color:${C.soft}">Each piece is tested and packed in its AXIA box with its GRA certificate.</span></td></tr>
      <tr><td width="26" style="vertical-align:top;color:${C.ice};font-weight:700">3</td><td><b>Shipped to you.</b> <span style="color:${C.soft}">You’ll get tracking details by email the day it leaves us.</span></td></tr>
    </table>`,
    button(`${brandUrl()}/support`, 'Visit the help centre'),
  ].join('');

  const text = [
    `Order confirmed: #${order.orderNumber}`, '',
    ...order.items.map(i => `${i.name}${i.qty > 1 ? ' x ' + i.qty : ''}${i.options ? ' (' + i.options + ')' : ''}: ${aud(i.priceAUD * i.qty)}`),
    ...(order.gift ? [`${order.gift.name}${order.gift.length ? ' (' + order.gift.length + ')' : ''}: free gift`] : []),
    '', `Total paid: ${aud(order.totalAUD)} AUD`, '',
    'Every piece is hand-set and made to order, so allow approximately 3 to 5 weeks before it ships.',
    `Help centre: ${brandUrl()}/support`,
  ].join('\n');

  return {
    subject: `Your AXIA order #${order.orderNumber} is confirmed`,
    html: layout({ siteUrl, preheader: `Order #${order.orderNumber} confirmed. Allow 3 to 5 weeks for your hand-set piece.`, heading: 'Order confirmed', body }),
    text,
  };
}

export function statusEmail(order, status, siteUrl, { tracking, note } = {}) {
  const t = STATUS_EMAILS[status];
  if (!t) throw new Error(`No email for status ${status}`);
  const first = (order.customer.name || '').split(' ')[0];
  const trackingBlock = status === 'shipped' && tracking && (tracking.number || tracking.carrier)
    ? `${sectionTitle('Tracking')}<p style="margin:0;${font};font-size:15px;color:${C.ink}">${esc(tracking.carrier || 'Carrier')}${tracking.number ? `: <b>${esc(tracking.number)}</b>` : ''}</p>${tracking.url ? button(tracking.url, 'Track your parcel') : ''}`
    : '';
  const body = [
    p(`${first ? `Hi ${esc(first)},` : 'Hi,'}`),
    p(t.intro),
    note ? `<div style="margin:6px 0 4px;padding:14px 16px;border-left:3px solid ${C.ice};background:${C.iceBg};${font};font-size:14px;line-height:1.55;color:${C.ink}">${esc(note).replace(/\n/g, '<br>')}</div>` : '',
    progress(status),
    trackingBlock,
    sectionTitle(`Order #${order.orderNumber}`),
    itemsTable(order, siteUrl),
    status === 'shipped' ? address(order) : '',
    status === 'fulfilled' ? `${sectionTitle('Looking after it')}${p(`Wipe it with the included cloth and keep it in its box when you’re not wearing it. More tips in our <a href="${esc(brandUrl())}/support#care" style="color:${C.ice}">care guide</a>.`, C.soft)}` : '',
    button(`${brandUrl()}/support`, 'Visit the help centre'),
  ].join('');

  const text = [
    t.heading, '', t.intro, ...(note ? ['', note] : []),
    ...(trackingBlock ? ['', `Tracking: ${tracking.carrier || ''} ${tracking.number || ''} ${tracking.url || ''}`.trim()] : []),
    '', `Order #${order.orderNumber}`, ...order.items.map(i => `${i.name}${i.qty > 1 ? ' x ' + i.qty : ''}`),
    '', `Help centre: ${brandUrl()}/support`,
  ].join('\n');

  return { subject: t.subject(order.orderNumber), html: layout({ siteUrl, preheader: t.intro.slice(0, 110), heading: t.heading, body }), text };
}

/**
 * A personal message from the AXIA team (an Inbox reply or a note to a customer),
 * in the same branded layout. `quote` is the customer's original message, if any.
 */
export function messageEmail({ name, subject, body, siteUrl, quote, orderNumber }) {
  const first = String(name || '').trim().split(/\s+/)[0];
  const paras = String(body).trim().split(/\n{2,}/).map(t => p(esc(t).replace(/\n/g, '<br>'))).join('');
  const quoted = quote ? `${sectionTitle('Your message')}<div style="border-left:3px solid ${C.line};padding:4px 0 4px 14px;${font};font-size:13.5px;line-height:1.6;color:${C.soft}">${esc(quote.text).replace(/\n/g, '<br>')}${quote.at ? `<br><span style="font-size:12px">Sent ${esc(quote.at)}</span>` : ''}</div>` : '';
  const html = layout({
    siteUrl, preheader: String(body).trim().slice(0, 110), heading: subject,
    reason: 'You’re receiving this email because you contacted or ordered from AXIA.',
    body: `${first ? p(`Hi ${esc(first)},`) : ''}${paras}${p('Warm regards,<br><b>The AXIA team</b>')}`
      + (orderNumber ? p(`<span style="font-size:13px;color:${C.soft}">Order #${esc(orderNumber)}</span>`) : '')
      + quoted + `<div style="margin-top:22px">${button(`${brandUrl()}/support`, 'Visit the help centre')}</div>`,
  });
  const text = [first ? `Hi ${first},` : '', String(body).trim(), 'Warm regards,\nThe AXIA team', orderNumber ? `Order #${orderNumber}` : '',
    quote ? `--- Your message ---\n${quote.text}` : '', `Help centre: ${brandUrl()}/support`].filter(Boolean).join('\n\n');
  return { subject, html, text };
}

/** Welcome email for a new sign-up, with their first-order code. */
export function welcomeEmail({ name, code, percentOff, siteUrl }) {
  const first = String(name || '').trim().split(/\s+/)[0];
  const shop = `${brandUrl()}/shop`;
  const codeBox = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr><td align="center" style="background:${C.iceBg};border:1px dashed ${C.ice};border-radius:6px;padding:22px 14px">
    <p style="margin:0 0 6px;${font};font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${C.ice}">Your code</p>
    <p style="margin:0;${font};font-size:30px;font-weight:700;letter-spacing:.14em;color:${C.ink}">${esc(code)}</p>
    <p style="margin:8px 0 0;${font};font-size:13px;color:${C.soft}">${esc(percentOff)}% off your first order. Enter it at checkout.</p>
  </td></tr></table>`;
  const body = [
    p(`${first ? `Hi ${esc(first)}, welcome` : 'Welcome'} to AXIA. You’re on the list, so you’ll hear about every drop before anyone else.`),
    p(`As a thank you, here’s ${esc(percentOff)}% off your first piece.`),
    codeBox,
    button(shop, 'Shop AXIA'),
    sectionTitle('Why AXIA'),
    p('Every piece is hand-set in 925 sterling silver with VVS D-colour moissanite that passes a diamond tester, and comes with a GRA certificate, a lifetime warranty and free 30-day size exchanges.', C.soft),
  ].join('');
  const html = layout({
    siteUrl, preheader: `Here’s ${percentOff}% off your first order: ${code}`, heading: 'Welcome to AXIA', body,
    reason: 'You’re receiving this email because you signed up at axiajewellery.com. Unsubscribe any time with the link below.',
  });
  const text = [`${first ? `Hi ${first}, welcome` : 'Welcome'} to AXIA. You’re on the list, so you’ll hear about every drop before anyone else.`,
    `As a thank you, here’s ${percentOff}% off your first piece. Your code: ${code} (enter it at checkout).`,
    `Shop: ${shop}`, `Help centre: ${brandUrl()}/support`].join('\n\n');
  return { subject: `Welcome to AXIA: ${percentOff}% off your first order`, html, text };
}

/**
 * Sends one email. Returns { id } with the Resend email id, or null when
 * Resend isn't set up (so test orders still work without email).
 */
export async function sendEmail({ to, subject, html, text, idempotencyKey }) {
  const from = process.env.ORDER_EMAIL_FROM;
  if (!resend || !from) {
    console.warn('email: RESEND_API_KEY or ORDER_EMAIL_FROM not set, skipping', subject);
    return null;
  }
  // Never hold an email back over the link: fall back to the contact page.
  const unsub = await unsubscribeUrl(to).catch(err => { console.error('email: no unsubscribe link', err); return null; });
  const link = unsub || `${brandUrl()}/support#contact`;
  const { data, error } = await resend.emails.send({
    from, to, subject,
    html: html.split(UNSUBSCRIBE).join(esc(link)),
    text: text && `${text}\n\nUnsubscribe from AXIA news and offers: ${link}`,
    ...(unsub ? { headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
    ...(process.env.ORDER_EMAIL_REPLY_TO ? { replyTo: process.env.ORDER_EMAIL_REPLY_TO } : {}),
  }, idempotencyKey ? { idempotencyKey } : undefined);
  if (error) throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
  return { id: data && data.id };
}
