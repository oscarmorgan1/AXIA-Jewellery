import type { Collection, Product, Promotion, PromoTheme, StoreDiscount } from '../types';
import { statusOf } from './catalogue';

/** Banner colours. Keep in step with assets/css/promo.css (.promo--<theme>). */
export const THEMES: { key: PromoTheme; label: string; bg: string; fg: string; accent: string }[] = [
  { key: 'obsidian', label: 'Obsidian', bg: '#111315', fg: '#F4F1EA', accent: '#C7EAF7' },
  { key: 'ice', label: 'Ice', bg: '#C7EAF7', fg: '#111315', accent: '#2A6076' },
  { key: 'bone', label: 'Bone', bg: '#F4F1EA', fg: '#111315', accent: '#B0174F' },
  { key: 'magenta', label: 'Magenta', bg: '#CF2657', fg: '#FFF7F9', accent: '#FFF7F9' },
  { key: 'rose', label: 'Rose', bg: '#F6D6DE', fg: '#4A1024', accent: '#B0174F' },
  { key: 'gold', label: 'Black & gold', bg: '#16130D', fg: '#F3E6C4', accent: '#D9B866' },
  { key: 'emerald', label: 'Emerald', bg: '#0F2A22', fg: '#EAF3EE', accent: '#C9E8D7' },
];
export const themeOf = (k: string) => THEMES.find(t => t.key === k) || THEMES[0];

/** Same rounding as the server (server/variants.js salePrice) and the storefront. */
export const salePrice = (aud: number, pct: number) => Math.round((aud * (100 - pct)) / 100);

const rid = () => Math.random().toString(36).slice(2, 8);
export const newId = (name: string) => `${(name || 'promo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'promo'}-${rid()}`;

export function blankPromotion(): Promotion {
  return {
    id: '', name: '', on: true, pct: 20, scope: 'all', productIds: [], collections: [], maxPriceAUD: null,
    startsAt: '', endsAt: '', allowPromos: false,
    banner: { show: true, strip: true, style: 'theme', theme: 'obsidian', image: '', eyebrow: '', headline: '', text: '', ctaLabel: 'Shop the sale', ctaHref: 'sale', showCountdown: true },
  };
}

/** A promotion with every field present (older saves, or a hand-edited document). */
export function withDefaults(p: Partial<Promotion>): Promotion {
  const b = blankPromotion();
  return { ...b, ...p, banner: { ...b.banner, ...(p.banner || {}) }, productIds: p.productIds || [], collections: p.collections || [] };
}

/** The next given month/day at local midnight, this year or next. */
function next(month: number, day: number, hour = 23, minute = 59) {
  const now = new Date();
  let d = new Date(now.getFullYear(), month - 1, day, hour, minute);
  if (d.getTime() < now.getTime()) d = new Date(now.getFullYear() + 1, month - 1, day, hour, minute);
  return d.toISOString();
}
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(23, 59, 0, 0); return d.toISOString(); };

export const TEMPLATES: { key: string; label: string; hint: string; make: () => Promotion }[] = [
  {
    key: 'storewide', label: 'Storewide sale', hint: '30% off every piece until 26 December, big banner on the home page',
    make: () => ({ ...blankPromotion(), name: 'Storewide sale', pct: 30, endsAt: new Date('2026-12-26T23:59:00+11:00').getTime() > Date.now() ? new Date('2026-12-26T23:59:00+11:00').toISOString() : inDays(7),
      banner: { ...blankPromotion().banner, eyebrow: 'Storewide sale', headline: '30% off everything', text: 'Every piece in the store. Hand-set moissanite in 925 sterling silver, made to order.', theme: 'obsidian' } }),
  },
  {
    key: 'valentines', label: 'Valentine’s Day', hint: 'A collection or pieces under a price, rose theme',
    make: () => ({ ...blankPromotion(), name: 'Valentine’s Day', pct: 40, maxPriceAUD: 300, startsAt: next(2, 1, 0, 0), endsAt: next(2, 14),
      banner: { ...blankPromotion().banner, eyebrow: 'Valentine’s Day', headline: '40% off pieces under A$300', text: 'Gifts that last. Order by 7 February for delivery before the 14th.', theme: 'rose', ctaLabel: 'Shop gifts' } }),
  },
  {
    key: 'black-friday', label: 'Black Friday', hint: 'Short and loud, black and gold',
    make: () => ({ ...blankPromotion(), name: 'Black Friday', pct: 35, endsAt: inDays(4),
      banner: { ...blankPromotion().banner, eyebrow: 'Black Friday', headline: '35% off the store', text: 'Four days only.', theme: 'gold' } }),
  },
  {
    key: 'christmas', label: 'Christmas', hint: 'Emerald theme, ends Christmas Eve',
    make: () => ({ ...blankPromotion(), name: 'Christmas', pct: 25, endsAt: next(12, 24, 12, 0),
      banner: { ...blankPromotion().banner, eyebrow: 'Christmas', headline: '25% off for the holidays', text: 'Order by 15 December for Christmas delivery.', theme: 'emerald', ctaLabel: 'Shop gifts' } }),
  },
  { key: 'blank', label: 'Blank', hint: 'Start from nothing', make: blankPromotion },
];

export type PromoStatus = 'Live' | 'Scheduled' | 'Ended' | 'Off' | 'Needs pieces';
export function statusOfPromo(p: Promotion, now = Date.now()): PromoStatus {
  if (!p.on) return 'Off';
  if (p.endsAt && Date.parse(p.endsAt) <= now) return 'Ended';
  if ((p.scope === 'products' && !p.productIds.length) || (p.scope === 'collections' && !p.collections.length)) return 'Needs pieces';
  if (p.startsAt && Date.parse(p.startsAt) > now) return 'Scheduled';
  return 'Live';
}

/** Whether p covers this product at this price (server/promotions.js covers). */
export function covers(p: Promotion, product: Product, priceAUD: number) {
  if (p.maxPriceAUD && priceAUD > p.maxPriceAUD) return false;
  if (p.scope === 'all') return true;
  if (p.scope === 'products') return p.productIds.includes(product.id);
  return (product.coll || []).some(c => p.collections.includes(c));
}

/** The live pieces a promotion covers at their from-price, for the editor's preview and count. */
export function coveredProducts(p: Promotion, products: Product[]) {
  return products.filter(x => statusOf(x) === 'Live' && (x.fromPriceAUD || 0) > 0 && covers(p, x, x.fromPriceAUD || 0));
}

export function scopeSummary(p: Promotion, cols: Collection[], products: Product[]) {
  const under = p.maxPriceAUD ? ` priced A$${p.maxPriceAUD.toLocaleString('en-AU')} or less` : '';
  if (p.scope === 'all') return (p.maxPriceAUD ? 'Every piece' : 'Every piece in the store') + under;
  if (p.scope === 'collections') {
    const names = p.collections.map(s => cols.find(c => c.slug === s)?.name || s);
    return (names.length ? names.join(', ') : 'No collections picked') + under;
  }
  const names = p.productIds.map(id => products.find(x => x.id === id)?.name || id);
  return (names.length ? (names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ')) : 'No pieces picked') + under;
}

/**
 * The promotions taking money off right now, the older store discount included as an
 * "every piece" one (server/promotions.js activePromotions).
 */
export function runningPromotions(items: Promotion[], legacy?: StoreDiscount | null, now = Date.now()): Promotion[] {
  const out = items.map(withDefaults).filter(p => statusOfPromo(p, now) === 'Live' && p.pct >= 1 && p.pct <= 90);
  if (legacy?.on && legacy.pct >= 1 && legacy.pct <= 90 && !(legacy.endsAt && Date.parse(legacy.endsAt) <= now)) {
    out.push({ ...blankPromotion(), id: 'store-discount', name: 'Store discount', pct: legacy.pct, endsAt: legacy.endsAt || '' });
  }
  return out;
}

/** The promotion that applies to a product at a price: the biggest that covers it (they never stack). */
export function promoFor(promos: Promotion[], product: Product, priceAUD: number): Promotion | null {
  let best: Promotion | null = null;
  for (const p of promos) if (covers(p, product, priceAUD) && (!best || p.pct > best.pct)) best = p;
  return best;
}
