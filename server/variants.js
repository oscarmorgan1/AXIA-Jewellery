// Product options and sets. Pure functions, no Firestore, shared by checkout
// (pricing.js), the public catalogue, returns and the tests.
//
// A product sells in sizes:
//   - one width:   `variants: [{ length, priceAUD }]` (and `width` as a label);
//   - many widths: `widths: [{ width, hidden?, image?, images?, variants: [...] }]`,
//     each width with its own lengths and prices (the Classic Tennis Bracelet shape).
//     A width with `hidden: true` is Coming soon: shown, not sold.
//
// A set (`set` on the product) is made of other products:
//   set.components: [{ productId, width, length }]
//     width/length: a fixed size the admin chose, or null for "the buyer picks".
//   set.sharedWidth: every component the buyer picks a width for takes the same width.
//   set.pricing: { mode: 'fixed', priceAUD } | { mode: 'discount', amountAUD } | { mode: 'percent', pct }
//     fixed: one price; discount/percent: the components' own prices added up, less that.
//
// An old product that was merged into another keeps its document, archived,
// with `mergedInto: { id, width }`, so past orders, links and saved bags still resolve.

const s = v => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));

/** The product's widths in one shape, also for a single-width product ({ width: p.width, variants }). */
export function widthsOf(p) {
  if (!p) return [];
  if (Array.isArray(p.widths) && p.widths.length) return p.widths.filter(Boolean);
  return [{ width: p.width || null, variants: Array.isArray(p.variants) ? p.variants : [] }];
}

export const hasWidths = p => !!(p && Array.isArray(p.widths) && p.widths.length);

/**
 * The size bought: { width, length, priceAUD, image } or null when that size isn't sold.
 * `opts.allowHidden` lets a size the admin fixed in a set through even if its width is Coming soon.
 */
export function pickVariant(p, width, length, opts = {}) {
  if (!p) return null;
  const many = hasWidths(p);
  const w = many ? p.widths.find(x => x && x.width === s(width)) : widthsOf(p)[0];
  if (!w || (w.hidden && !opts.allowHidden)) return null;
  const variants = (w.variants || []).filter(v => v && !v.hidden);
  const v = p.singlePrice || variants.length === 1 && variants[0].length == null
    ? variants[0]
    : variants.find(x => s(x.length) === s(length));
  if (!v || !(v.priceAUD > 0)) return null;
  return {
    width: many ? w.width : (p.width || null),
    length: v.length || null,
    priceAUD: v.priceAUD,
    image: (many && ((w.images && w.images[0]) || w.image)) || '',
  };
}

/** "4mm · 20"" for a size, leaving out what doesn't apply. */
export const sizeLabel = (width, length) => [width, length].filter(Boolean).join(' · ');

export class SetError extends Error {}

/** Set price from its components' prices. */
export function setPrice(pricing, componentPrices) {
  const sum = componentPrices.reduce((a, n) => a + n, 0);
  const m = (pricing && pricing.mode) || 'fixed';
  if (m === 'discount') return Math.max(0, Math.round(sum - (Number(pricing.amountAUD) || 0)));
  if (m === 'percent') return Math.max(0, Math.round(sum * (1 - (Number(pricing.pct) || 0) / 100)));
  return Number(pricing && pricing.priceAUD) || 0;
}

/**
 * Prices one set as the buyer configured it.
 * @param {object} set  the set product
 * @param {(id: string) => object|null} product  its component products, already loaded
 * @param {Array<{width?: string, length?: string}>} parts  the buyer's choice per component
 * @returns {{ priceAUD: number, components: Array<{id, name, width, length, colour, priceAUD}> }}
 */
export function priceSet(set, product, parts = []) {
  const cfg = set && set.set;
  const comps = (cfg && Array.isArray(cfg.components) ? cfg.components : []).filter(c => c && c.productId);
  if (!comps.length) throw new SetError(`${(set && set.name) || 'This set'} has no pieces in it yet.`);
  const shared = cfg.sharedWidth ? s((parts.find(x => x && x.width) || {}).width) : '';
  const out = comps.map((c, i) => {
    const p = product(c.productId);
    if (!p || p.archived) throw new SetError(`A piece in ${set.name} is no longer available.`);
    const pick = parts[i] || {};
    const fixedW = c.width != null && c.width !== '';
    const fixedL = c.length != null && c.length !== '';
    const width = hasWidths(p) ? (fixedW ? c.width : (cfg.sharedWidth ? shared : s(pick.width))) : null;
    const length = fixedL ? c.length : s(pick.length);
    const v = pickVariant(p, width, length, { allowHidden: fixedW });
    if (!v) throw new SetError(`We couldn't match the size you picked for ${p.name} in ${set.name}. Please remove it from your bag and add it again.`);
    const colour = (Array.isArray(p.col) && p.col[0]) || 'Silver';
    return { id: p.id || c.productId, name: p.name, width: v.width || '', length: v.length || '', colour, priceAUD: v.priceAUD };
  });
  const priceAUD = setPrice(cfg.pricing, out.map(c => c.priceAUD));
  if (!(priceAUD > 0)) throw new SetError(`${set.name} isn't priced yet.`);
  return { priceAUD, components: out };
}

/** Cheapest way to buy a set (the "From" price on cards), or null if no combination prices. */
export function setFromPrice(set, product) {
  const cfg = set && set.set;
  const comps = (cfg && cfg.components) || [];
  if (!comps.length) return null;
  const options = comps.map(c => {
    const p = product(c.productId);
    if (!p) return [];
    const ws = widthsOf(p).filter(w => !w.hidden || c.width);
    return ws.filter(w => !c.width || !hasWidths(p) || w.width === c.width).flatMap(w =>
      (w.variants || []).filter(v => v && v.priceAUD > 0 && (!c.length || s(v.length) === s(c.length)))
        .map(v => ({ width: hasWidths(p) ? w.width : null, priceAUD: v.priceAUD })));
  });
  if (options.some(o => !o.length)) return null;
  const cheapest = list => Math.min(...list.map(o => o.priceAUD));
  if (cfg.sharedWidth) {
    // the shared width has to exist on every component that picks one
    const picks = comps.map((c, i) => !c.width && hasWidths(product(c.productId)) ? i : -1).filter(i => i >= 0);
    const widths = picks.length ? [...new Set(options[picks[0]].map(o => o.width))].filter(w => picks.every(i => options[i].some(o => o.width === w))) : [null];
    const totals = widths.map(w => options.map((o, i) => cheapest(picks.includes(i) ? o.filter(x => x.width === w) : o)).reduce((a, n) => a + n, 0));
    return totals.length ? setPrice(cfg.pricing, [Math.min(...totals)]) : null;
  }
  return setPrice(cfg.pricing, [options.reduce((a, o) => a + cheapest(o), 0)]);
}

// ---- Pieces per order line. A set line of qty 2 with 2 components is 4 pieces:
// each piece carries `orderComponent` (its index in the line's components).

/** How many pieces one unit of this order line is. */
export const partsOf = item => (item && Array.isArray(item.components) && item.components.length) || 1;

/** Where returned units are counted (order.returnedQty): "line" for a piece, "line:component" for part of a set. */
export const unitKey = (line, component) => (component == null ? String(line) : `${line}:${component}`);

/**
 * Refund for the set lines of a return, by the set rule: returning part of a set
 * gives back the set price less the full price of the pieces kept. Returning all of
 * it gives back the set price.
 * @param {object} item  the order line (with components and priceAUD)
 * @param {number[]} back  pieces returned per component, this return and earlier ones together
 * @param {number[]} before  pieces returned per component before this return
 */
export function setRefund(item, back, before = []) {
  const comps = item.components || [];
  const qty = Number(item.qty) || 1;
  const unitRefund = returnedFor => {
    let total = 0;
    for (let u = 0; u < qty; u++) {
      const returned = comps.map((_, c) => (returnedFor[c] || 0) > u);
      if (!returned.some(Boolean)) continue;
      const kept = comps.reduce((a, c, k) => a + (returned[k] ? 0 : Number(c.priceAUD) || 0), 0);
      total += Math.max(0, (Number(item.priceAUD) || 0) - kept);
    }
    return total;
  };
  return Math.max(0, unitRefund(back) - unitRefund(before));
}

/**
 * The site-wide store discount (site/discount, Website in the admin portal) when it's running:
 * { pct, allowPromos, endsAt }, otherwise null. Off, outside 1-90%, or past its end date is null.
 */
export function activeDiscount(d, now = Date.now()) {
  if (!d || d.on !== true) return null;
  const pct = Math.round(Number(d.pct) * 100) / 100;
  if (!(pct >= 1 && pct <= 90)) return null;
  const end = d.endsAt && typeof d.endsAt.toDate === 'function' ? d.endsAt.toDate().toISOString() : (d.endsAt || '');
  if (end && !(Date.parse(end) > now)) return null;
  return { pct, allowPromos: d.allowPromos !== false, endsAt: end };
}

/** A price with the store discount taken off, to the whole dollar. The storefront rounds the same way (assets/js/catalogue.js AXIA_SALE). */
export const salePrice = (aud, pct) => (pct ? Math.round((aud * (100 - pct)) / 100) : aud);
