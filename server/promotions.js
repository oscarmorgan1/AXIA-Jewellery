// Promotions (admin: Promotions), kept in site/promotions as { items: [...] }.
// Pure functions, no Firestore, so checkout, /api/catalogue and the tests share them.
//
// A promotion takes a percentage off the pieces it covers: every piece, some
// collections or some products, optionally only those priced at or under an amount.
// Prices are never changed in products/: the sale price is worked out from the
// current price every time (salePrice), so editing a price moves its sale price too.
// When two promotions cover the same piece, the bigger discount wins; they never stack.
// The storefront does the same sums (assets/js/catalogue.js AXIA_SALE).

import { activeDiscount, salePrice } from './variants.js';

export const THEMES = ['obsidian', 'ice', 'bone', 'magenta', 'rose', 'gold', 'emerald'];
export const SCOPES = ['all', 'collections', 'products'];

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const iso = v => {
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  const s = str(v, 40);
  return s && !Number.isNaN(Date.parse(s)) ? s : '';
};
const list = (v, max = 200) => (Array.isArray(v) ? [...new Set(v.map(x => str(x, 120)).filter(Boolean))].slice(0, max) : []);

/** One promotion with every field checked and defaulted. Bad input never throws. */
export function normalizePromotion(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const b = r.banner && typeof r.banner === 'object' ? r.banner : {};
  const max = Number(r.maxPriceAUD);
  return {
    id: str(r.id, 60) || 'promo',
    name: str(r.name, 80) || 'Promotion',
    on: r.on === true,
    pct: Math.round(Number(r.pct) * 100) / 100 || 0,
    scope: SCOPES.includes(r.scope) ? r.scope : 'all',
    productIds: list(r.productIds),
    collections: list(r.collections, 50),
    maxPriceAUD: max > 0 ? Math.round(max) : null,
    startsAt: iso(r.startsAt),
    endsAt: iso(r.endsAt),
    allowPromos: r.allowPromos !== false,
    banner: {
      show: b.show !== false,
      strip: b.strip !== false,
      style: b.style === 'photo' ? 'photo' : 'theme',
      theme: THEMES.includes(b.theme) ? b.theme : 'obsidian',
      image: str(b.image, 1000),
      eyebrow: str(b.eyebrow, 60),
      headline: str(b.headline, 90),
      text: str(b.text, 240),
      ctaLabel: str(b.ctaLabel, 40),
      ctaHref: /^(\/|#|https:\/\/|[a-z0-9-]+(\?|#|$))/i.test(str(b.ctaHref, 300)) ? str(b.ctaHref, 300) : '',
      showCountdown: b.showCountdown !== false,
    },
  };
}

/** Whether a promotion is taking money off right now: on, 1-90%, started and not ended. */
export function isRunning(p, now = Date.now()) {
  if (!p || p.on !== true || !(p.pct >= 1 && p.pct <= 90)) return false;
  if (p.startsAt && Date.parse(p.startsAt) > now) return false;
  if (p.endsAt && !(Date.parse(p.endsAt) > now)) return false;
  if (p.scope === 'products' && !p.productIds.length) return false;
  if (p.scope === 'collections' && !p.collections.length) return false;
  return true;
}

/**
 * The promotions running now, from site/promotions and the older single store discount
 * (site/discount, which still works as an "every piece" promotion with no banner).
 */
export function activePromotions(doc, legacy = null, now = Date.now()) {
  const items = (doc && Array.isArray(doc.items) ? doc.items : []).slice(0, 50).map(normalizePromotion);
  const out = items.filter(p => isRunning(p, now));
  const old = activeDiscount(legacy, now);
  if (old) {
    out.push(normalizePromotion({
      id: 'store-discount', name: 'Store discount', on: true, pct: old.pct, scope: 'all',
      endsAt: old.endsAt, allowPromos: old.allowPromos, banner: { show: false, strip: false },
    }));
  }
  return out;
}

/** Whether promotion p covers this product at this price (the price before any discount). */
export function covers(p, product, priceAUD) {
  if (!p || !product) return false;
  if (p.maxPriceAUD && Number(priceAUD) > p.maxPriceAUD) return false;
  if (p.scope === 'all') return true;
  if (p.scope === 'products') return p.productIds.includes(product.id);
  if (p.scope === 'collections') return (product.coll || []).some(c => p.collections.includes(c));
  return false;
}

/** The promotion that applies to this product at this price (the biggest), or null. */
export function promoFor(promos, product, priceAUD) {
  let best = null;
  for (const p of promos || []) if (covers(p, product, priceAUD) && (!best || p.pct > best.pct)) best = p;
  return best;
}

/** A price after its promotion, with the promotion used: { priceAUD, promo }. */
export function promoPrice(promos, product, priceAUD) {
  const promo = promoFor(promos, product, priceAUD);
  return { priceAUD: promo ? salePrice(priceAUD, promo.pct) : priceAUD, promo };
}

/** What the storefront gets: the running promotions without the admin-only bits. */
export function publicPromotions(active) {
  return (active || []).map(p => ({
    id: p.id, name: p.name, pct: p.pct, scope: p.scope, productIds: p.productIds, collections: p.collections,
    maxPriceAUD: p.maxPriceAUD, endsAt: p.endsAt, allowPromos: p.allowPromos, banner: p.banner,
  }));
}

// ---- Giveaways (admin: Giveaways), kept in site/giveaways as { items: [...] } ----
// The site shows one at a time: the running one that ends soonest, else the one that
// ended most recently (for 30 days, with its "closed" text). Until any are saved, the
// built-in 15mm Micro Pavé giveaway below runs, ending when site/giveaway says (the
// first version's single end date) or 11:59 pm Sydney time on 26 December 2026.

export const DEFAULT_GIVEAWAY = {
  id: 'micro-pave-15mm',
  on: true,
  title: 'Win the 15mm Micro Pavé Chain',
  prize: '15mm Micro Pavé Cuban Chain',
  valueAUD: 2699,
  image: 'assets/img/products/micro-pave-cuban-chain-15mm/1.jpg',
  description: 'Our 15mm Micro Pavé Cuban chain, fully iced in hand-set VVS moissanite and 925 sterling silver. Sign up free and follow us on Instagram to go in the draw.',
  steps: ['Sign up free below. That’s your entry.', 'Follow AXIA on Instagram.', 'One entry per person. Australian residents 18+.'],
  instagram: '',
  startsAt: '',
  endsAt: '2026-12-26T23:59:00+11:00',
  showCountdown: true,
  endedText: 'Entries are closed. The winner is announced within 7 days.',
  winnerText: 'Winner drawn at random and announced within 7 days of entries closing.',
};

export function normalizeGiveaway(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_GIVEAWAY;
  const value = Number(r.valueAUD);
  return {
    id: str(r.id, 60) || 'giveaway',
    on: r.on !== false,
    title: str(r.title, 90) || 'AXIA Giveaway',
    prize: str(r.prize, 90),
    valueAUD: value > 0 ? Math.round(value) : null,
    image: str(r.image, 1000),
    description: str(r.description, 600),
    steps: (Array.isArray(r.steps) ? r.steps : []).map(x => str(x, 160)).filter(Boolean).slice(0, 6),
    instagram: str(r.instagram, 40).replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, ''),
    startsAt: iso(r.startsAt),
    endsAt: iso(r.endsAt),
    showCountdown: r.showCountdown !== false,
    endedText: str(r.endedText, 160) || d.endedText,
    winnerText: str(r.winnerText, 200),
  };
}

/** The giveaway the site shows now, or null. `legacy` is the first version's site/giveaway. */
export function currentGiveaway(doc, legacy = null, now = Date.now()) {
  let items = doc && Array.isArray(doc.items) ? doc.items.slice(0, 50).map(normalizeGiveaway) : null;
  if (!items) {
    const end = legacy && iso(legacy.endsAt);
    items = [normalizeGiveaway({ ...DEFAULT_GIVEAWAY, ...(end ? { endsAt: end } : {}), ...(legacy && legacy.show === false ? { showCountdown: false } : {}) })];
  }
  const live = items.filter(g => g.on && g.endsAt && !(g.startsAt && Date.parse(g.startsAt) > now));
  const running = live.filter(g => Date.parse(g.endsAt) > now).sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));
  if (running.length) return running[0];
  const ended = live.filter(g => now - Date.parse(g.endsAt) < 30 * 86400e3).sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt));
  return ended[0] || null;
}

/** What the storefront gets as site.giveaway. label/show keep the first version's names for promo.js. */
export function publicGiveaway(g) {
  if (!g) return null;
  return { ...g, label: g.title, show: g.showCountdown };
}
