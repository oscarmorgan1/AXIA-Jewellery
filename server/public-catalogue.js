// What the storefront may see of the catalogue. Pure functions, no Firestore,
// so the export script (scripts/export-products.mjs) and the tests use them too.
//
// products/ is admins only in firestore.rules. Browsers get the catalogue from
// GET /api/catalogue (server/catalogue.js), built here:
//   - archived products are left out;
//   - live products go out as they are, minus the portal's bookkeeping;
//   - hidden ("Coming soon") products go out as teasers: name, photos and the
//     fields the pages need to draw a card or a locked page, with every price,
//     the description and the set contents taken out. Prices are 0 so the
//     page scripts' price maths keeps working; the pages show "Coming soon".
//     Pieces with their own showcase page (`linkTo`, the Titans) keep their
//     description and lengths, which that page shows.

import { hasWidths, setFromPrice, widthsOf } from './variants.js';

const BOOKKEEPING = ['sort', 'archived', 'updatedAt', 'mergedInto'];
const PRIVATE = ['economics', 'factory_cost_AUD', 'factoryCostAUD', 'cost'];

// Everything a teaser keeps. Anything not listed here is dropped.
const TEASER = ['id', 'name', 'width', 'cat', 'cons', 'level', 'col', 'badge', 'mto', 'coll', 'art',
  'images', 'imagesByColor', 'showBoth', 'video', 'videoPoster', 'linkTo', 'titan', 'singlePrice',
  'defaultLength', 'defaultWidth', 'sizingImage', 'colourToCloseup', 'collWidth'];

const lengthsOnly = variants => (Array.isArray(variants) ? variants : [])
  .map(v => ({ length: v && v.length != null ? v.length : null, priceAUD: 0 }));

// A Coming soon width of a live product: shown as a chip, with no prices.
const teaserWidth = w => ({ width: w && w.width, hidden: true, image: w && w.image, ...(w && w.images ? { images: w.images } : {}), ...(w && w.imagesByColor ? { imagesByColor: w.imagesByColor } : {}), ...(w && w.col ? { col: w.col } : {}), fromPriceAUD: 0, variants: lengthsOnly(w && w.variants).slice(0, 1) });

/**
 * What the product page needs to build a set: each component with the sizes the
 * buyer can pick and their prices, so it works even when a component isn't
 * listed on its own (a Coming soon piece).
 */
function publicSet(p, product) {
  const cfg = p.set || {};
  return {
    sharedWidth: !!cfg.sharedWidth,
    pricing: cfg.pricing || { mode: 'fixed', priceAUD: 0 },
    components: (cfg.components || []).filter(c => c && c.productId).map(c => {
      const cp = product(c.productId) || {};
      const many = hasWidths(cp);
      const ws = widthsOf(cp).filter(w => w && (!w.hidden || (c.width && w.width === c.width)))
        .filter(w => !many || !c.width || w.width === c.width);
      return {
        productId: c.productId, name: cp.name || '', cat: cp.cat || '', art: cp.art || '',
        image: (cp.images || [])[0] || (ws[0] && ((ws[0].images && ws[0].images[0]) || ws[0].image)) || '',
        width: many ? (c.width || null) : (cp.width || null), length: c.length || null, pickWidth: many && !c.width,
        singlePrice: !!cp.singlePrice,
        options: ws.map(w => ({
          width: many ? w.width : null,
          // that width's own photo, so the set page can show the size the buyer picks
          image: (w.images && w.images[0]) || w.image || '',
          lengths: (w.variants || []).filter(v => v && v.priceAUD > 0 && !v.hidden && (!c.length || v.length === c.length))
            .map(v => ({ length: v.length == null ? null : v.length, priceAUD: v.priceAUD })),
        })).filter(o => o.lengths.length),
      };
    }),
  };
}

/** The storefront's copy of one product, or null when it shouldn't be listed at all. */
export function publicProduct(p, product = () => null) {
  if (!p || !p.id || p.archived) return null;
  if (!p.hidden) {
    const out = { ...p };
    for (const k of [...BOOKKEEPING, ...PRIVATE]) delete out[k];
    if (Array.isArray(out.widths)) {
      out.widths = out.widths.map(w => (w && w.hidden ? teaserWidth(w) : w));
      const prices = out.widths.filter(w => w && !w.hidden).flatMap(w => (w.variants || []).map(v => v && v.priceAUD)).filter(n => n > 0);
      if (prices.length) out.fromPriceAUD = Math.min(...prices);
    }
    if (p.set) {
      out.set = publicSet(p, product);
      const from = setFromPrice(p, product);
      if (from) out.fromPriceAUD = from;
    }
    return out;
  }
  const out = { hidden: true };
  for (const k of TEASER) if (p[k] !== undefined) out[k] = p[k];
  out.desc = p.linkTo ? (p.desc || '') : '';
  out.variants = p.linkTo ? lengthsOnly(p.variants) : lengthsOnly(p.variants).slice(0, 1);
  if (!out.variants.length) out.variants = [{ length: null, priceAUD: 0 }];
  out.fromPriceAUD = 0;
  if (Array.isArray(p.widths)) {
    out.widths = p.widths.map(w => ({ width: w && w.width, image: w && w.image, ...(w && w.images ? { images: w.images } : {}), ...(w && w.imagesByColor ? { imagesByColor: w.imagesByColor } : {}), ...(w && w.col ? { col: w.col } : {}), fromPriceAUD: 0, variants: lengthsOnly(w && w.variants).slice(0, 1) }));
  }
  return out;
}

/** The whole public list, in the portal's order. */
export function publicProducts(list) {
  const byId = new Map((list || []).filter(p => p && p.id).map(p => [p.id, p]));
  const product = id => byId.get(id) || null;
  return (list || []).slice()
    .sort((a, b) => ((a && a.sort) || 0) - ((b && b.sort) || 0))
    .map(p => publicProduct(p, product)).filter(Boolean);
}

/** Old product ids merged into another: id -> { id, width }, for links and saved bags. */
export function mergedIds(list) {
  const out = {};
  for (const p of list || []) if (p && p.id && p.mergedInto && p.mergedInto.id) out[p.id] = { id: p.mergedInto.id, width: p.mergedInto.width || null };
  return out;
}
