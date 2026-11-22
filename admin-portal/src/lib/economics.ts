import type { CostAssumptions, Order, Product, ProductCost } from '../types';
import { costOf } from './variants';

export const DEFAULT_ASSUMPTIONS: CostAssumptions = {
  paymentFeePct: 0.026,
  paymentFeeFixedAUD: 0.3,
  packagingPerUnitAUD: 2,
  shippingAUD: 0,
  returnsReservePct: 0.05,
};

/**
 * Retail price at the size the factory cost was quoted for, e.g. "4mm / 20\"",
 * "8\"" or "one size". Falls back to the product's "from" price.
 */
export function retailAtSize(p: Product, size?: string | null): number | null {
  const s = (size || '').trim();
  const parts = s.split('/').map(x => x.trim());
  const width = parts.length > 1 ? parts[0] : undefined;
  const length = parts.length > 1 ? parts[1] : parts[0];
  const find = (vs?: { length: string | null; priceAUD: number }[]) => vs?.find(v => v.length === length)?.priceAUD;
  if (p.widths?.length) {
    const w = p.widths.find(x => x.width === width) || p.widths.find(x => x.width === p.defaultWidth) || p.widths[0];
    const hit = find(w?.variants);
    if (hit != null) return hit;
  }
  const hit = find(p.variants);
  if (hit != null) return hit;
  return p.fromPriceAUD ?? null;
}

export interface Economics {
  retailAUD: number;
  /** Retail less GST (when the cost sheet's GST setting is on). */
  netRetailAUD: number;
  factoryCostAUD: number;
  /** Freight allowance per piece, in A$. */
  freightAUD: number;
  grossProfitAUD: number;
  grossMarginPct: number;
  markup: number;
  paymentFeeAUD: number;
  contributionAUD: number;
  contributionMarginPct: number;
  breakEvenRoas: number | null;
  maxAdPerSaleAUD: number;
}

/**
 * Same formulas as the owner's margins sheet: gross margin = (retail less GST − factory
 * cost − freight) ÷ retail less GST. GST and freight come from the sheet's settings
 * (internal/costAssumptions gstPct, freightUSD, usdPerAud); without them they're 0.
 */
export function economics(retail: number | null, cost: number | null, a: CostAssumptions = DEFAULT_ASSUMPTIONS): Economics | null {
  if (retail == null || cost == null || retail <= 0) return null;
  const net = retail / (1 + (a.gstPct || 0));
  const freight = a.freightUSD && a.usdPerAud ? a.freightUSD / a.usdPerAud : 0;
  const landed = cost + freight;
  const gp = net - landed;
  const fee = retail * a.paymentFeePct + a.paymentFeeFixedAUD;
  const contribution = gp - fee - a.packagingPerUnitAUD - a.shippingAUD;
  return {
    retailAUD: retail,
    netRetailAUD: net,
    factoryCostAUD: cost,
    freightAUD: freight,
    grossProfitAUD: gp,
    grossMarginPct: (gp / net) * 100,
    markup: landed > 0 ? gp / landed : 0,
    paymentFeeAUD: fee,
    contributionAUD: contribution,
    contributionMarginPct: (contribution / retail) * 100,
    breakEvenRoas: contribution > 0 ? retail / contribution : null,
    maxAdPerSaleAUD: Math.max(0, contribution / 2),
  };
}

export function productEconomics(p: Product, c: ProductCost | undefined, a: CostAssumptions) {
  if (!c) return null;
  return economics(retailAtSize(p, c.representativeSize), c.factoryCostAUD, a);
}

/** Margins of one size, from its own cost. */
export function sizeEconomics(retail: number, c: ProductCost | undefined, width: string | null, length: string | null, a: CostAssumptions) {
  const v = costOf(c, width, length);
  return v && v.factoryCostAUD != null ? economics(retail, v.factoryCostAUD, a) : null;
}

// ---- What-if pricing (Margins > Simulator). Nothing here is saved. ----

/** Price after a price change (%) then a discount (%), to the whole dollar like the store. */
export function tryPrice(base: number, opts: { changePct?: number; discountPct?: number; override?: number | null }) {
  if (opts.override != null && opts.override > 0) return Math.round(opts.override);
  const moved = Math.round(base * (1 + (opts.changePct || 0) / 100));
  return Math.round((moved * (100 - (opts.discountPct || 0))) / 100);
}

/** The retail price (GST in) that gives this gross margin on a cost, to the whole dollar up. */
export function priceForMargin(cost: number, marginPct: number, a: CostAssumptions = DEFAULT_ASSUMPTIONS): number | null {
  if (!(marginPct < 100) || cost == null) return null;
  const freight = a.freightUSD && a.usdPerAud ? a.freightUSD / a.usdPerAud : 0;
  const net = (cost + freight) / (1 - marginPct / 100);
  return Math.ceil(net * (1 + (a.gstPct || 0)));
}

// ---- Order margins: from what the buyer actually paid. ----

export interface OrderLineEconomics {
  /** Index in order.items. */
  line: number;
  qty: number;
  /** Price per unit before any promotion (the list price), and after it. */
  listUnitAUD: number;
  unitAUD: number;
  /** This line's share of the order's promo code discount, per unit. */
  couponUnitAUD: number;
  /** What one unit really brought in: after the promotion and its share of the code. */
  paidUnitAUD: number;
  /** Factory cost of one unit (every piece of a set), or null when a cost is missing. */
  unitCostAUD: number | null;
  e: Economics | null;
}

export interface OrderEconomics {
  lines: OrderLineEconomics[];
  units: number;
  listAUD: number;
  promotionOffAUD: number;
  couponOffAUD: number;
  /** Items after every discount (shipping not included). */
  revenueAUD: number;
  /** The same, for the lines with a cost (what the margin is worked out on). */
  costedRevenueAUD: number;
  costAUD: number;
  giftCostAUD: number;
  freightAUD: number;
  grossProfitAUD: number;
  grossMarginPct: number | null;
  /** Gross margin had it sold at list prices with no discount, for comparison. */
  listMarginPct: number | null;
  feesAUD: number;
  contributionAUD: number;
  /** Lines (or the gift) with no factory cost, so the totals leave them out. */
  missing: string[];
}

type CostLookup = (id: string) => ProductCost | undefined;
type ProductLookup = (id: string) => Product | undefined;

/** A piece's factory cost at a size, trying the product's own width when the order didn't record one. */
export function pieceCost(id: string, width: string | null | undefined, length: string | null | undefined, cost: CostLookup, product?: ProductLookup): number | null {
  const p = product?.(id);
  const ids = [id, p?.mergedInto?.id].filter(Boolean) as string[];
  for (const k of ids) {
    const c = cost(k);
    const tries: [string | null | undefined, string | null | undefined][] = [[width, length], [p?.width, length], [null, length], [width || p?.width, null]];
    for (const [w, l] of tries) {
      const v = costOf(c, w || null, l || null);
      if (v?.factoryCostAUD != null) return v.factoryCostAUD;
    }
  }
  return null;
}

/**
 * An order's margins from what was paid: each line's price is already after its promotion
 * (checkout stores the sale price as priceAUD and the price before it as listPriceAUD), and
 * the promo code discount (discountAUD, from Stripe) is shared across the lines by value.
 * A free gift adds its cost and nothing to revenue. Fees are worked out on the total paid.
 */
export function orderEconomics(o: Order, cost: CostLookup, a: CostAssumptions = DEFAULT_ASSUMPTIONS, product?: ProductLookup): OrderEconomics {
  const items = o.items || [];
  const gross = items.reduce((s, i) => s + (Number(i.priceAUD) || 0) * (i.qty || 1), 0);
  const coupon = Math.min(Number(o.discountAUD) || 0, gross);
  const gst = 1 + (a.gstPct || 0);
  const freightPer = a.freightUSD && a.usdPerAud ? a.freightUSD / a.usdPerAud : 0;
  const missing: string[] = [];
  let units = 0, list = 0, revenue = 0, costSum = 0, freight = 0, costedRevenue = 0, costedList = 0;

  const lines = items.map((i, line): OrderLineEconomics => {
    const qty = i.qty || 1;
    const unit = Number(i.priceAUD) || 0;
    const listUnit = Number(i.listPriceAUD) || unit;
    const couponUnit = gross > 0 ? (coupon * unit) / gross : 0;
    const paidUnit = unit - couponUnit;
    let unitCost: number | null;
    let pieces = 1;
    if (i.components?.length) {
      const cs = i.components.map(c => pieceCost(c.id, c.width, c.length, cost, product));
      unitCost = cs.every(x => x != null) ? (cs as number[]).reduce((s, x) => s + x, 0) : null;
      pieces = i.components.length;
    } else {
      unitCost = i.id ? pieceCost(i.id, i.width, i.length, cost, product) : null;
    }
    units += qty * pieces;
    list += listUnit * qty;
    revenue += paidUnit * qty;
    if (unitCost == null) missing.push(i.name || i.id || `Line ${line + 1}`);
    else { costSum += unitCost * qty; freight += freightPer * qty * pieces; costedRevenue += paidUnit * qty; costedList += listUnit * qty; }
    return { line, qty, listUnitAUD: listUnit, unitAUD: unit, couponUnitAUD: couponUnit, paidUnitAUD: paidUnit, unitCostAUD: unitCost, e: unitCost != null ? economics(paidUnit, unitCost, a) : null };
  });

  let giftCost = 0;
  if (o.gift?.id) {
    const g = pieceCost(o.gift.id, null, o.gift.length, cost, product);
    if (g == null) missing.push(`${o.gift.name || 'Free gift'} (free gift)`);
    else { giftCost = g; freight += freightPer; units += 1; }
  }

  const landed = costSum + giftCost + freight;
  const gp = costedRevenue / gst - landed;
  const listGp = costedList / gst - landed;
  const fees = (Number(o.totalAUD) || 0) * a.paymentFeePct + (o.totalAUD ? a.paymentFeeFixedAUD : 0);
  const contribution = gp - fees - (a.packagingPerUnitAUD + a.shippingAUD) * units;
  return {
    lines, units, listAUD: list, promotionOffAUD: list - gross, couponOffAUD: coupon, revenueAUD: revenue, costedRevenueAUD: costedRevenue,
    costAUD: costSum, giftCostAUD: giftCost, freightAUD: freight,
    grossProfitAUD: gp, grossMarginPct: costedRevenue > 0 ? (gp / (costedRevenue / gst)) * 100 : null,
    listMarginPct: costedList > 0 ? (listGp / (costedList / gst)) * 100 : null,
    feesAUD: fees, contributionAUD: contribution, missing,
  };
}
