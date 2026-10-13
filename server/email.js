// Order confirmation email, sent through Resend.
import { resend } from './services.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const aud = n => 'A$' + Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

export function confirmationEmail(order, siteUrl) {
  const first = (order.customer.name || '').split(' ')[0];
  const row = (l, r, strong) => `<tr><td style="padding:6px 0;color:${strong ? '#111315' : '#5b5e63'};${strong ? 'font-weight:700;' : ''}">${l}</td><td style="padding:6px 0;text-align:right;color:#111315;${strong ? 'font-weight:700;' : ''}">${r}</td></tr>`;
  const items = order.items.map(i =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #e6e2d9;color:#111315"><b>${esc(i.name)}</b>${i.qty > 1 ? ' × ' + i.qty : ''}${i.options ? `<br><span style="color:#5b5e63;font-size:13px">${esc(i.options)}</span>` : ''}</td><td style="padding:10px 0;border-bottom:1px solid #e6e2d9;text-align:right;color:#111315;white-space:nowrap">${aud(i.priceAUD * i.qty)}</td></tr>`).join('');
  const gift = order.gift
    ? `<tr><td style="padding:10px 0;border-bottom:1px solid #e6e2d9;color:#111315"><b>${esc(order.gift.name)}</b>${order.gift.length ? `<br><span style="color:#5b5e63;font-size:13px">${esc(order.gift.length)}</span>` : ''}</td><td style="padding:10px 0;border-bottom:1px solid #e6e2d9;text-align:right;color:#111315">Free gift</td></tr>`
    : '';
  const a = order.shipping.address || {};
  const address = [order.shipping.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' ')].filter(Boolean).map(esc).join('<br>');

  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fbfaf6;border:1px solid #e6e2d9;border-radius:6px">
<tr><td style="padding:28px 28px 8px"><img src="${esc(siteUrl)}/assets/img/axia-logo.png" alt="AXIA" height="24" style="display:block;height:24px"></td></tr>
<tr><td style="padding:8px 28px 0">
<h1 style="margin:16px 0 8px;font-size:26px;letter-spacing:.01em;text-transform:uppercase;color:#111315">Order confirmed</h1>
<p style="margin:0 0 6px;color:#111315">${first ? 'Thank you, ' + esc(first) + '.' : 'Thank you.'} We've received your order <b>#${esc(order.orderNumber)}</b>.</p>
<p style="margin:0 0 18px;color:#5b5e63">Every piece is hand-set and made to order, so allow approximately 3-5 weeks before it ships. We'll email you when it's on its way.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}${gift}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
${row('Subtotal', aud(order.subtotalAUD))}
${order.discountAUD ? row('Discount' + (order.promotionCode ? ' (' + esc(order.promotionCode) + ')' : ''), '-' + aud(order.discountAUD)) : ''}
${row(esc(order.shipping.method || 'Shipping'), order.shipping.amountAUD ? aud(order.shipping.amountAUD) : 'Free')}
${row('Total paid (AUD)', aud(order.totalAUD), true)}
</table>
${address ? `<p style="margin:22px 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5b5e63">Shipping to</p><p style="margin:0;color:#111315">${address}</p>` : ''}
</td></tr>
<tr><td style="padding:24px 28px 28px;color:#5b5e63;font-size:13px">Questions about your order? Reply to this email or visit <a href="${esc(siteUrl)}/support" style="color:#2a6076">our support page</a>.<br>Lifetime warranty · 30-day exchanges</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `Order confirmed: #${order.orderNumber}`, '',
    ...order.items.map(i => `${i.name}${i.qty > 1 ? ' x ' + i.qty : ''}${i.options ? ' (' + i.options + ')' : ''}: ${aud(i.priceAUD * i.qty)}`),
    ...(order.gift ? [`${order.gift.name}${order.gift.length ? ' (' + order.gift.length + ')' : ''}: free gift`] : []),
    '', `Total paid: ${aud(order.totalAUD)} AUD`, '',
    'Every piece is hand-set and made to order, so allow approximately 3-5 weeks before it ships.',
  ].join('\n');

  return { subject: `Your AXIA order #${order.orderNumber}`, html, text };
}

/** Sends the confirmation. Returns false (and logs) when Resend isn't set up. */
export async function sendConfirmation(order, siteUrl) {
  const from = process.env.ORDER_EMAIL_FROM;
  if (!resend || !from) {
    console.warn('email: RESEND_API_KEY or ORDER_EMAIL_FROM not set, skipping confirmation for', order.orderNumber);
    return false;
  }
  const { subject, html, text } = confirmationEmail(order, siteUrl);
  const { error } = await resend.emails.send({
    from,
    to: order.customer.email,
    ...(process.env.ORDER_EMAIL_REPLY_TO ? { replyTo: process.env.ORDER_EMAIL_REPLY_TO } : {}),
    subject, html, text,
  }, { idempotencyKey: `order-confirmation/${order.stripe.sessionId}` });
  if (error) throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
  return true;
}
