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

const BOOKKEEPING = ['sort', 'archived', 'updatedAt'];
const PRIVATE = ['economics', 'factory_cost_AUD', 'factoryCostAUD', 'cost'];

// Everything a teaser keeps. Anything not listed here is dropped.
const TEASER = ['id', 'name', 'width', 'cat', 'cons', 'level', 'col', 'badge', 'mto', 'coll', 'art',
  'images', 'imagesByColor', 'showBoth', 'video', 'videoPoster', 'linkTo', 'titan', 'singlePrice',
  'defaultLength', 'defaultWidth', 'sizingImage', 'colourToCloseup'];

const lengthsOnly = variants => (Array.isArray(variants) ? variants : [])
  .map(v => ({ length: v && v.length != null ? v.length : null, priceAUD: 0 }));

/** The storefront's copy of one product, or null when it shouldn't be listed at all. */
export function publicProduct(p) {
  if (!p || !p.id || p.archived) return null;
  if (!p.hidden) {
    const out = { ...p };
    for (const k of [...BOOKKEEPING, ...PRIVATE]) delete out[k];
    return out;
  }
  const out = { hidden: true };
  for (const k of TEASER) if (p[k] !== undefined) out[k] = p[k];
  out.desc = p.linkTo ? (p.desc || '') : '';
  out.variants = p.linkTo ? lengthsOnly(p.variants) : lengthsOnly(p.variants).slice(0, 1);
  if (!out.variants.length) out.variants = [{ length: null, priceAUD: 0 }];
  out.fromPriceAUD = 0;
  if (Array.isArray(p.widths)) {
    out.widths = p.widths.map(w => ({ width: w && w.width, image: w && w.image, fromPriceAUD: 0, variants: lengthsOnly(w && w.variants).slice(0, 1) }));
  }
  return out;
}

/** The whole public list, in the portal's order. */
export function publicProducts(list) {
  return (list || []).slice()
    .sort((a, b) => ((a && a.sort) || 0) - ((b && b.sort) || 0))
    .map(publicProduct).filter(Boolean);
}
