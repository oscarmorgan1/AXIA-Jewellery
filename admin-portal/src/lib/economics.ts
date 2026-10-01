import type { CostAssumptions, Product, ProductCost } from '../types';

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
  factoryCostAUD: number;
  grossProfitAUD: number;
  grossMarginPct: number;
  markup: number;
  paymentFeeAUD: number;
  contributionAUD: number;
  contributionMarginPct: number;
  breakEvenRoas: number | null;
  maxAdPerSaleAUD: number;
}

/** Same formulas as the owner's margins sheet. */
export function economics(retail: number | null, cost: number | null, a: CostAssumptions = DEFAULT_ASSUMPTIONS): Economics | null {
  if (retail == null || cost == null || retail <= 0) return null;
  const gp = retail - cost;
  const fee = retail * a.paymentFeePct + a.paymentFeeFixedAUD;
  const contribution = gp - fee - a.packagingPerUnitAUD - a.shippingAUD;
  return {
    retailAUD: retail,
    factoryCostAUD: cost,
    grossProfitAUD: gp,
    grossMarginPct: (gp / retail) * 100,
    markup: cost > 0 ? retail / cost : 0,
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
