// Prices a bag on the server. The browser only says which pieces and options
// were chosen; every price comes from the Firestore product, so nobody can
// pay less by editing their cart in the browser.

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
 * @param {Array} items  [{ id, width?, length?, colour?, engraving?, q? }]
 * @param {(id: string) => Promise<object|null>} getProduct  loads products/{id}
 * @param {{ giftLength?: string }} [extra]  the free bracelet's length, picked in the bag
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
    const id = str(raw && raw.id, 120);
    const p = id && (await load(id));
    if (!isBuyable(p)) throw new CartError('A piece in your bag is no longer available. Please remove it and try again.');

    // Only the choice comes from the browser (width, length, colour, engraving,
    // quantity). Any price it sends is ignored: the price is the Firestore one.
    const widths = Array.isArray(p.widths) && p.widths.length ? p.widths : null;
    const pick = widths ? widths.find(w => w.width === str(raw.width)) : { width: p.width || null, variants: p.variants || [] };
    const variants = (pick && pick.variants) || [];
    const variant = p.singlePrice ? variants[0] : variants.find(x => x.length === str(raw.length));
    const width = widths ? (pick ? pick.width : null) : (p.width || null);
    if (!variant || !(variant.priceAUD > 0)) {
      throw new CartError(`We couldn't match the size you picked for ${p.name}. Please remove it from your bag and add it again.`);
    }

    const cols = Array.isArray(p.col) && p.col.length ? p.col : ['Silver'];
    const colour = cols.includes(str(raw.colour)) ? str(raw.colour) : cols[0];
    const engraving = canEngrave(p) ? str(String(raw.engraving || '').replace(/[<>]/g, ''), ENGRAVE_MAX) : '';
    const qty = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(raw.q) || 1)));

    const options = [];
    if (widths) options.push(width);
    if (cols.length > 1) options.push(colour);
    if (!p.singlePrice && variant.length) options.push(variant.length);
    if (engraving) options.push(`Engraved: “${engraving}”`);

    lines.push({
      id: p.id || id,
      name: p.name + (width ? ', ' + width : ''),
      options: options.join(' · '),
      width: width || '',
      length: variant.length || '',
      colour,
      engraving,
      qty,
      priceAUD: variant.priceAUD,
      image: (widths && (widths.find(w => w.width === width) || {}).image)
        || (p.imagesByColor && (p.imagesByColor[colour] || [])[0])
        || (p.images || [])[0] || '',
    });
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
