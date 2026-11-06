// Printable paperwork for one order: a packing slip to go in the box and a tax
// invoice for the customer. Each is a self-contained A4 page opened in its own
// window, which prints itself; "Save as PDF" in the print dialog makes a file.
import type { Order } from '../types';
import { orderNo } from './orders';

/** Who issues the invoice. AXIA's ABN is the one in the storefront footer. */
export const BUSINESS = {
  name: 'AXIA Jewellery',
  abn: '64 972 889 034',
  site: 'axiajewellery.com.au',
  email: 'support@axiajewellery.com',
};

/** Australian GST is 10%, so a GST-inclusive price holds 1/11 of itself in GST. */
export const gstIn = (incl: number) => Math.round((incl / 11) * 100) / 100;

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (n?: number) => `A$${(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (o: Order) => (o.createdAt ? o.createdAt.toDate() : new Date()).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
const opts = (i: NonNullable<Order['items']>[number]) => [i.width, i.length, i.colour].filter(Boolean).join(' · ') || i.options || '';

function addressLines(o: Order): string[] {
  const a = o.shipping?.address;
  if (!a) return [];
  return [
    o.shipping?.name || o.customer?.name || '',
    a.line1 || '', a.line2 || '',
    [a.city, a.state, a.postal_code].filter(Boolean).join(' '),
    a.country === 'AU' ? 'Australia' : a.country || '',
  ].filter(Boolean);
}

const CSS = `
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #111315; }
body { font: 10.5pt/1.5 'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet { max-width: 178mm; margin: 0 auto; padding: 24px 0 40px; }
@media print { .sheet { padding: 0; } .noprint { display: none !important; } }
header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 14px; border-bottom: 1.5pt solid #111315; }
.mark { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 700; font-size: 22pt; letter-spacing: .16em; line-height: 1; }
.issuer { font-size: 8.5pt; color: #565D66; margin-top: 6px; }
.doc { text-align: right; }
.doc h1 { margin: 0; font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-size: 17pt; font-weight: 600; letter-spacing: -.01em; }
.doc .no { font-variant-numeric: tabular-nums; margin-top: 2px; }
.meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 14px 0; border-bottom: .5pt solid rgba(17,19,21,.22); }
.meta h2 { margin: 0 0 3px; font-size: 7.5pt; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #565D66; }
.meta p { margin: 0; }
table { width: 100%; border-collapse: collapse; margin-top: 18px; font-variant-numeric: tabular-nums; }
th { text-align: left; font-size: 7.5pt; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #565D66; padding: 0 8px 6px 0; border-bottom: .5pt solid rgba(17,19,21,.22); }
td { padding: 10px 8px 10px 0; border-bottom: .5pt solid rgba(17,19,21,.11); vertical-align: top; }
th.n, td.n { text-align: right; padding-right: 0; padding-left: 8px; white-space: nowrap; }
td small { display: block; color: #565D66; font-size: 9pt; }
.engrave { display: inline-block; margin-top: 4px; padding: 1px 6px; border: .5pt solid #111315; border-radius: 3px; font-size: 9pt; }
.engrave b { font-family: 'Cormorant', Georgia, serif; font-size: 11pt; font-style: italic; font-weight: 600; }
.tick { width: 14px; height: 14px; border: 1pt solid #111315; border-radius: 2px; display: inline-block; }
.totals { margin: 14px 0 0 auto; width: 70mm; font-variant-numeric: tabular-nums; }
.totals div { display: flex; justify-content: space-between; padding: 3px 0; }
.totals .grand { border-top: 1.5pt solid #111315; margin-top: 6px; padding-top: 8px; font-weight: 700; font-size: 12pt; }
.totals .gst { color: #565D66; font-size: 9pt; }
.paid { display: inline-block; margin-top: 18px; padding: 2px 8px; border: 1pt solid #1F7A4D; color: #1F7A4D; border-radius: 3px; font-size: 8.5pt; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
.paid--off { border-color: #C4234B; color: #C4234B; }
.note { margin-top: 28px; padding-top: 12px; border-top: .5pt solid rgba(17,19,21,.22); color: #565D66; font-size: 9pt; }
.note b { color: #111315; }
.bar { position: sticky; top: 0; display: flex; gap: 8px; justify-content: flex-end; padding: 10px 16px; background: #F4F1EA; border-bottom: 1px solid rgba(17,19,21,.11); font: 600 13px system-ui, sans-serif; }
.bar button { min-height: 32px; padding: 0 14px; border-radius: 4px; border: 1px solid rgba(17,19,21,.22); background: #FBFAF6; font: inherit; cursor: pointer; }
.bar button.primary { background: #111315; border-color: #111315; color: #F4F1EA; }
`;

function page(title: string, body: string) {
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Hanken+Grotesk:wght@400;600;700&family=Cormorant:ital,wght@1,600&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="bar noprint"><button onclick="window.close()">Close</button><button class="primary" onclick="window.print()">Print or save PDF</button></div>
<div class="sheet">${body}</div>
<script>document.fonts.ready.then(function(){ setTimeout(function(){ window.print(); }, 150); });</script>
</body></html>`;
}

const head = (kind: string, o: Order, extra = '') => `
<header>
  <div><div class="mark">AXIA</div><div class="issuer">${esc(BUSINESS.name)} · ABN ${esc(BUSINESS.abn)}<br>${esc(BUSINESS.site)} · ${esc(BUSINESS.email)}</div></div>
  <div class="doc"><h1>${esc(kind)}</h1><div class="no">Order #${esc(orderNo(o))}</div>${extra}</div>
</header>`;

/** Goes in the box: what's inside, where it's going, nothing about money. */
export function packingSlipHtml(o: Order): string {
  const ship = addressLines(o);
  const rows = (o.items || []).map(i => `
    <tr><td><b>${esc(i.name)}</b>${opts(i) ? `<small>${esc(opts(i))}</small>` : ''}
      ${i.engraving ? `<span class="engrave">Engraved: <b>${esc(i.engraving)}</b></span>` : ''}</td>
      <td class="n">${esc(i.qty || 1)}</td><td class="n"><span class="tick"></span></td></tr>`).join('')
    + (o.gift ? `<tr><td><b>${esc(o.gift.name)}</b><small>Free gift${o.gift.length ? ` · ${esc(o.gift.length)}` : ''}</small></td><td class="n">1</td><td class="n"><span class="tick"></span></td></tr>` : '');
  return page(`Packing slip #${orderNo(o)}`, `
${head('Packing slip', o)}
<section class="meta">
  <div><h2>Ship to</h2><p>${ship.map(esc).join('<br>') || '–'}</p></div>
  <div><h2>Ordered</h2><p>${esc(day(o))}</p></div>
  <div><h2>Shipping</h2><p>${esc(o.shipping?.method || 'Standard')}${o.tracking?.number ? `<br>${esc(o.tracking.carrier || '')} ${esc(o.tracking.number)}` : ''}</p></div>
</section>
<table><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Packed</th></tr></thead><tbody>${rows}</tbody></table>
<p class="note"><b>Thank you${o.customer?.name ? `, ${esc(o.customer.name.split(' ')[0])}` : ''}.</b> Every AXIA piece is set by hand to order. Questions about your order? Email ${esc(BUSINESS.email)} with your order number.</p>`);
}

/** A GST tax invoice for the order, as paid. Prices on AXIA include GST. */
export function taxInvoiceHtml(o: Order): string {
  const ship = addressLines(o);
  const refunded = o.status === 'refunded' || o.status === 'cancelled';
  const total = o.totalAUD || 0;
  const rows = (o.items || []).map(i => `
    <tr><td><b>${esc(i.name)}</b>${opts(i) ? `<small>${esc(opts(i))}</small>` : ''}${i.engraving ? `<small>Engraving: ${esc(i.engraving)}</small>` : ''}</td>
      <td class="n">${esc(i.qty || 1)}</td><td class="n">${money(i.priceAUD)}</td><td class="n">${money((i.priceAUD || 0) * (i.qty || 1))}</td></tr>`).join('')
    + (o.gift ? `<tr><td><b>${esc(o.gift.name)}</b><small>Free gift</small></td><td class="n">1</td><td class="n">${money(0)}</td><td class="n">${money(0)}</td></tr>` : '');
  const card = o.stripe?.card ? `${o.stripe.card.brand ? o.stripe.card.brand[0].toUpperCase() + o.stripe.card.brand.slice(1) : 'Card'} ending ${o.stripe.card.last4}` : 'Card, via Stripe';
  return page(`Tax invoice #${orderNo(o)}`, `
${head('Tax invoice', o, `<div class="no">Issued ${esc(day(o))}</div>`)}
<section class="meta">
  <div><h2>Billed to</h2><p>${esc(o.customer?.name || '–')}${o.customer?.email ? `<br>${esc(o.customer.email)}` : ''}${o.customer?.phone ? `<br>${esc(o.customer.phone)}` : ''}</p></div>
  <div><h2>Ship to</h2><p>${ship.map(esc).join('<br>') || '–'}</p></div>
  <div><h2>Payment</h2><p>${esc(card)}${o.stripe?.paymentIntent ? `<br><small style="color:#565D66">Ref ${esc(o.stripe.paymentIntent)}</small>` : ''}</p></div>
</section>
<table><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals">
  <div><span>Subtotal</span><span>${money(o.subtotalAUD)}</span></div>
  ${(o.discountAUD || 0) > 0 ? `<div><span>Discount${o.promotionCode ? ` (${esc(o.promotionCode)})` : ''}</span><span>−${money(o.discountAUD)}</span></div>` : ''}
  <div><span>Shipping${o.shipping?.method ? ` (${esc(o.shipping.method)})` : ''}</span><span>${o.shipping?.amountAUD ? money(o.shipping.amountAUD) : 'Free'}</span></div>
  <div class="grand"><span>Total (AUD)</span><span>${money(total)}</span></div>
  <div class="gst"><span>Includes GST of</span><span>${money(gstIn(total))}</span></div>
</div>
<span class="paid${refunded ? ' paid--off' : ''}">${o.status === 'refunded' ? 'Refunded' : o.status === 'cancelled' ? 'Cancelled' : o.status === 'pending' ? 'Awaiting payment' : `Paid ${esc(day(o))}`}</span>
<p class="note">All prices are in Australian dollars and include GST. ${esc(BUSINESS.name)}, ABN ${esc(BUSINESS.abn)}.</p>`);
}

/**
 * Opens an empty tab to fill in a moment later. Must run straight from the
 * click, or the browser blocks it. Null when it was blocked anyway.
 */
export function openBlank(message = 'Preparing…'): Window | null {
  const w = window.open('', '_blank');
  if (w) w.document.write(`<!doctype html><title>${esc(message)}</title><body style="font:14px system-ui,sans-serif;color:#565D66;padding:32px;background:#F4F1EA">${esc(message)}</body>`);
  return w;
}

/** Replaces a tab's contents with a document. */
export function writeDocument(w: Window, html: string) {
  w.document.open();
  w.document.write(html);
  w.document.close();
}
