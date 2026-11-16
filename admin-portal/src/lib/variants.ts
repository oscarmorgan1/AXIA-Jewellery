// Sizes, set prices and set refunds. The same rules as server/variants.js, which
// checkout uses: keep the two in step.
import type { CostAssumptions, Order, OrderItem, Piece, Product, ProductCost, SetConfig, SetPricing, VariantCost, WidthOption } from '../types';

export const hasWidths = (p?: Product | null): boolean => !!(p && p.widths && p.widths.length);

/** The product's widths in one shape, also for a single-width product. */
export function widthsOf(p?: Product | null): WidthOption[] {
  if (!p) return [];
  if (hasWidths(p)) return p.widths!;
  return [{ width: p.width || '', variants: p.variants || [] }];
}

/** Key of one size in productCosts/{id}.variants (server/migrate-variants.js costKey). */
export const costKey = (width?: string | null, length?: string | null) => `${width || ''}|${length || ''}`;

export const sizeLabel = (width?: string | null, length?: string | null) => [width, length].filter(Boolean).join(' · ');

/** Every size of a product: width, length, price, and whether its width is Coming soon. */
export function sizesOf(p: Product) {
  const many = hasWidths(p);
  return widthsOf(p).flatMap(w => (w.variants || []).map(v => ({
    width: many ? w.width : (p.width || null), length: v.length, priceAUD: v.priceAUD, hidden: !!w.hidden,
    key: costKey(many ? w.width : p.width, v.length),
  })));
}

/** A size's cost: the per-size cost, else the old one-cost-per-product when it was quoted for that size. */
export function costOf(c: ProductCost | undefined, width?: string | null, length?: string | null): VariantCost | null {
  if (!c) return null;
  const v = c.variants?.[costKey(width, length)];
  if (v) return v;
  // productCosts made before costs per size: one cost for the "representative" size.
  if (c.factoryCostAUD != null && !c.variants) {
    const rs = (c.representativeSize || '').split('/').map(s => s.trim());
    const [rw, rl] = rs.length > 1 ? rs : [null, rs[0]];
    if ((!rw || rw === width) && (rl === (length || 'one size') || rl === length)) return { factoryCostAUD: c.factoryCostAUD, estimated: c.factoryCostEstimated };
  }
  return null;
}

export function setPrice(pricing: SetPricing | undefined, prices: number[]): number {
  const sum = prices.reduce((a, n) => a + n, 0);
  if (!pricing) return 0;
  if (pricing.mode === 'discount') return Math.max(0, Math.round(sum - (Number(pricing.amountAUD) || 0)));
  if (pricing.mode === 'percent') return Math.max(0, Math.round(sum * (1 - (Number(pricing.pct) || 0) / 100)));
  return Number(pricing.priceAUD) || 0;
}

/** The sizes each component can be bought in, for the set editor and the From price. */
export function componentOptions(set: SetConfig, product: (id: string) => Product | undefined) {
  return set.components.map(c => {
    const p = product(c.productId);
    if (!p) return [];
    const many = hasWidths(p);
    return widthsOf(p).filter(w => !w.hidden || c.width).filter(w => !many || !c.width || w.width === c.width)
      .flatMap(w => (w.variants || []).filter(v => v.priceAUD > 0 && (!c.length || v.length === c.length))
        .map(v => ({ width: many ? w.width : null, length: v.length, priceAUD: v.priceAUD })));
  });
}

/** Cheapest and dearest way to buy the set. */
export function setRange(set: SetConfig, product: (id: string) => Product | undefined): { from: number; to: number } | null {
  if (!set.components.length) return null;
  const opts = componentOptions(set, product);
  if (opts.some(o => !o.length)) return null;
  const pickers = set.components.map((c, i) => (!c.width && hasWidths(product(c.productId)) ? i : -1)).filter(i => i >= 0);
  const widths = set.sharedWidth && pickers.length
    ? [...new Set(opts[pickers[0]].map(o => o.width))].filter(w => pickers.every(i => opts[i].some(o => o.width === w)))
    : [null];
  if (!widths.length) return null;
  const totals = widths.flatMap(w => {
    const per = opts.map((o, i) => (w && pickers.includes(i) ? o.filter(x => x.width === w) : o).map(x => x.priceAUD));
    return [per.reduce((a, l) => a + Math.min(...l), 0), per.reduce((a, l) => a + Math.max(...l), 0)];
  });
  return { from: setPrice(set.pricing, [Math.min(...totals)]), to: setPrice(set.pricing, [Math.max(...totals)]) };
}

// ---- Set lines on orders: one piece per component per unit.

export const partsOf = (item?: OrderItem) => (item?.components?.length || 1);
export const unitKey = (line: number, component?: number | null) => (component == null ? String(line) : `${line}:${component}`);

/** Set refund rule: the set price less what's kept at full price (server/variants.js setRefund). */
export function setRefund(item: OrderItem, back: number[], before: number[] = []): number {
  const comps = item.components || [];
  const qty = item.qty || 1;
  const unitRefund = (returned: number[]) => {
    let total = 0;
    for (let u = 0; u < qty; u++) {
      const r = comps.map((_, c) => (returned[c] || 0) > u);
      if (!r.some(Boolean)) continue;
      const kept = comps.reduce((a, c, k) => a + (r[k] ? 0 : c.priceAUD || 0), 0);
      total += Math.max(0, (item.priceAUD || 0) - kept);
    }
    return total;
  };
  return Math.max(0, unitRefund(back) - unitRefund(before));
}

/** Pieces of one set component returned in closed returns. */
export const returnedOf = (o: Order, line: number, component?: number | null) => Number(o.returnedQty?.[unitKey(line, component)]) || 0;

/** In stock per size: received, on no order, in no return (the registry's "In stock"). */
export function stockBySize(pieces: Piece[], productId: string) {
  const m = new Map<string, number>();
  for (const p of pieces) {
    if (p.productId !== productId || p.orderId || p.returnId || p.receivedOn === null || p.shippedOn) continue;
    const k = normSize(p.size);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}
/** With the maker per size: ordered, not received yet. */
export function makingBySize(pieces: Piece[], productId: string) {
  const m = new Map<string, number>();
  for (const p of pieces) {
    if (p.productId !== productId || p.receivedOn !== null || p.shippedOn || p.orderId) continue;
    const k = normSize(p.size);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}
/** A piece's size text ("4mm · 20"") in the form sizeLabel gives. */
export const normSize = (size?: string) => String(size || '').split('·').map(s => s.trim()).filter(Boolean).join(' · ');

/** Margins with GST and freight from the cost sheet, when those are set. */
export function netRetail(retail: number, a: CostAssumptions) { return retail / (1 + (a.gstPct || 0)); }
export function landedCost(factoryAUD: number, a: CostAssumptions) {
  return factoryAUD + (a.freightUSD && a.usdPerAud ? a.freightUSD / a.usdPerAud : 0);
}
