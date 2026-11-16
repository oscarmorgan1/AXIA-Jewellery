// Prices a bag on the server. The browser only says which pieces and options
// were chosen; every price comes from the Firestore product, so nobody can
// pay less by editing their cart in the browser.

import { hasWidths, pickVariant, priceSet, salePrice, SetError, sizeLabel } from './variants.js';

export const MAX_LINES = 20;
export const MAX_QTY = 10;
export const ENGRAVE_MAX = 14;
// Free Classic Tennis Bracelet with orders over this subtotal (matches the bag drawer).
export const GIFT_THRESHOLD_AUD = 999;
export const GIFT_PRODUCT_ID = 'tennis-bracelet';

export class CartError extends Error {}

const str = (v, max = 40) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function isBuyable(p) {
  return p && !p.archived && !p.hidden && !p.titan && !(p.coll || []).includes('titans');
}

const canEngrave = p => p.art === 'cuban' || p.art === 'cubanBracelet';

/**
 * Turns the browser's bag into priced lines.
 * @param {Array} items  [{ id, width?, length?, colour?, engraving?, q?, parts? }]
 *   parts: for a set, the buyer's [{ width?, length? }] per component, in the set's order
 * @param {(id: string) => Promise<object|null>} getProduct  loads products/{id}
 * @param {{ giftLength?: string, discountPct?: number }} [extra]  the free bracelet's length, picked in the bag,
 *   and the store discount running now (activeDiscount), taken off every line
 */
export async function priceCart(items, getProduct, extra = {}) {
  if (!Array.isArray(items) || !items.length) throw new CartError('Your bag is empty.');
  if (items.length > MAX_LINES) throw new CartError('Too many pieces in one order.');

  const cache = new Map();
  const load = async id => {
    if (!cache.has(id)) cache.set(id, await getProduct(id));
    return cache.get(id);
  };

  const lines = [];
  for (const raw of items) {
    let id = str(raw && raw.id, 120);
    let p = id && (await load(id));
    let width = str(raw && raw.width);
    // A piece merged into another (mergedInto): a bag saved before the merge still checks out.
    if (p && p.mergedInto && p.mergedInto.id) {
      if (!width) width = str(p.mergedInto.width);
      id = p.mergedInto.id;
      p = await load(id);
    }
    if (!isBuyable(p)) throw new CartError('A piece in your bag is no longer available. Please remove it and try again.');
    const qty = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(raw.q) || 1)));

    if (p.set) {
      // A set: each component priced from its own product, the set price from the set's rule.
      const ids = [...new Set((p.set.components || []).map(c => c && c.productId).filter(Boolean))];
      const loaded = new Map();
      for (const cid of ids) loaded.set(cid, await load(cid));
      let priced;
      try {
        priced = priceSet(p, cid => loaded.get(cid) || null, Array.isArray(raw.parts) ? raw.parts.slice(0, 10).map(x => ({ width: str(x && x.width), length: str(x && x.length) })) : []);
      } catch (err) {
        if (err instanceof SetError) throw new CartError(err.message);
        throw err;
      }
      lines.push({
        id: p.id || id,
        name: p.name,
        options: priced.components.map(c => [c.name, sizeLabel(c.width, c.length)].filter(Boolean).join(' ')).join(' + '),
        width: '', length: '', colour: '', engraving: '',
        qty,
        priceAUD: priced.priceAUD,
        components: priced.components,
        image: (p.images || [])[0] || '',
      });
      continue;
    }

    // Only the choice comes from the browser (width, length, colour, engraving,
    // quantity). Any price it sends is ignored: the price is the Firestore one.
    const many = hasWidths(p);
    const variant = pickVariant(p, many ? width : null, str(raw.length));
    if (!variant) {
      throw new CartError(`We couldn't match the size you picked for ${p.name}. Please remove it from your bag and add it again.`);
    }
    width = variant.width || '';

    const cols = Array.isArray(p.col) && p.col.length ? p.col : ['Silver'];
    const colour = cols.includes(str(raw.colour)) ? str(raw.colour) : cols[0];
    const engraving = canEngrave(p) ? str(String(raw.engraving || '').replace(/[<>]/g, ''), ENGRAVE_MAX) : '';

    const options = [];
    if (many) options.push(width);
    if (cols.length > 1) options.push(colour);
    if (!p.singlePrice && variant.length) options.push(variant.length);
    if (engraving) options.push(`Engraved: “${engraving}”`);

    lines.push({
      id: p.id || id,
      name: p.name + (width ? ', ' + width : ''),
      options: options.join(' · '),
      width,
      length: variant.length || '',
      colour,
      engraving,
      qty,
      priceAUD: variant.priceAUD,
      image: (many && variant.image)
        || (p.imagesByColor && (p.imagesByColor[colour] || [])[0])
        || (p.images || [])[0] || '',
    });
  }

  // The store discount comes off every line, set pieces included, so a set's refund
  // per piece (setRefund) works from what was paid. listPriceAUD keeps the price before it.
  const pct = Number(extra.discountPct) || 0;
  if (pct) {
    for (const l of lines) {
      l.listPriceAUD = l.priceAUD;
      l.priceAUD = salePrice(l.priceAUD, pct);
      if (l.components) l.components = l.components.map(c => ({ ...c, listPriceAUD: c.priceAUD, priceAUD: salePrice(c.priceAUD, pct) }));
    }
  }

  const subtotalAUD = lines.reduce((a, l) => a + l.priceAUD * l.qty, 0);
  let gift = null;
  if (subtotalAUD > GIFT_THRESHOLD_AUD) {
    const g = await load(GIFT_PRODUCT_ID);
    if (g && !g.archived) {
      const lengths = [...(g.variants || []), ...(g.widths || []).flatMap(w => w.variants || [])].map(v => v.length);
      const length = lengths.includes(str(extra.giftLength)) ? str(extra.giftLength) : '';
      gift = { id: GIFT_PRODUCT_ID, name: g.name || 'Classic Tennis Bracelet', length };
    }
  }
  return { lines, subtotalAUD, gift };
}
