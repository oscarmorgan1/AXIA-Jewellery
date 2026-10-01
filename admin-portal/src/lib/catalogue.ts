import type { Collection, Product } from '../types';

/** The collection a product is grouped under: its first shop collection, else its first known one. */
export function primaryCollection(p: Product, cols: Collection[]): Collection | undefined {
  const mine = cols.filter(c => (p.coll || []).includes(c.slug));
  return mine.find(c => c.showInShop) || mine[0];
}

export const collectionLabel = (c?: Collection) => (c ? c.tab || c.name.replace(/^The /, '') : 'Unsorted');

export type Status = 'Live' | 'Coming soon' | 'Redirect' | 'Archived';

export function statusOf(p: Product): Status {
  if (p.archived) return 'Archived';
  if (p.hidden) return 'Coming soon';
  if (p.linkTo) return 'Redirect';
  return 'Live';
}

export function firstImage(p: Product): string | undefined {
  return p.images?.[0]
    || Object.values(p.imagesByColor || {}).find(a => a?.length)?.[0]
    || p.widths?.find(w => w.image)?.image;
}

/** All prices across variants and widths. */
export function allPrices(p: Product): number[] {
  const v = (p.variants || []).map(x => x.priceAUD);
  const w = (p.widths || []).flatMap(x => (x.variants || []).map(y => y.priceAUD));
  return [...v, ...w].filter(n => typeof n === 'number' && !Number.isNaN(n));
}

/** Recompute derived price fields the storefront relies on. */
export function withDerivedPrices(p: Product): Product {
  const out: Product = { ...p };
  if (out.widths?.length) {
    out.widths = out.widths.map(w => {
      const prices = (w.variants || []).map(v => v.priceAUD).filter(n => typeof n === 'number');
      return { ...w, fromPriceAUD: prices.length ? Math.min(...prices) : w.fromPriceAUD };
    });
  }
  const prices = allPrices(out);
  if (prices.length) {
    out.fromPriceAUD = Math.min(...prices);
    out.singlePrice = new Set(prices).size === 1;
  }
  return out;
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
}
