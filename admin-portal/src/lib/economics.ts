import type { CostAssumptions, Product, ProductCost } from '../types';
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
