// One-off catalogue migration, run from Admin > Migration (temporary).
//
//   1. Merges products that are the same piece in different widths (same name,
//      e.g. Iced Cuban Bracelet 5mm, 10mm, 12mm) into one product with a width ×
//      length price grid, the Classic Tennis Bracelet shape. The old documents stay,
//      archived, with `mergedInto: { id, width }`: past orders keep their product
//      ids, and old links and saved bags land on the merged product (server/static.js,
//      pricing.js). Registry pieces and review videos move to the merged product.
//   2. Turns the sets that already list their products (`bundleOf`) into real
//      sets (`set`, see variants.js), at the same price.
//   3. Imports the cost spreadsheet (factory cost per width and length, the fee
//      settings), and if asked, its retail prices and the sizes the site doesn't sell yet.
//
// Preview builds the plan and changes nothing. Apply builds it again, refuses if
// anything changed since the preview, saves a copy of every document it is about
// to change under migrations/{runId}/before, then writes. Undo puts those copies back.
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './services.js';
import { syncPiece } from './sync.js';
import { hasWidths, setFromPrice } from './variants.js';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

// The spreadsheet's pricing groups and the product (by name, after merging) each one prices.
export const FAMILY_PRODUCTS = {
  'Tennis Bracelet': 'Classic Tennis Bracelet',
  'Tennis Chain': 'Classic Tennis Chain',
  'Cuban Bracelet': 'Iced Cuban Bracelet',
  'Cuban Chain': 'Iced Cuban Chain',
  'Moonrock Cuban Bracelet': 'Moonrock Cuban Bracelet',
  'Micro-Pave Cuban Bracelet': 'Micro Pavé Cuban Bracelet',
  'Micro-Pave Cuban Chain': 'Micro Pavé Cuban Chain',
  'Lucky Clover': 'Lucky Clover Bracelet',
  'Halo Tennis Bracelet': 'Square Halo Tennis Bracelet',
  'Multicolour Cross': 'Multicolour Moissanite Cross Pendant',
  'Cross Set': 'The Cross Set',
};

const mm = w => parseFloat(String(w || '').replace(/[^\d.]/g, '')) || 0;
const inches = l => parseFloat(String(l || '').replace(/[^\d.]/g, '')) || 0;
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
const isTitan = p => p.titan || (p.coll || []).includes('titans');
const isSet = p => !!(p.set || p.bundle || p.bundleOf || (p.coll || []).includes('sets'));
/** Key of one size in productCosts/{id}.variants: "4mm|20"" ("|" for one size). */
export const costKey = (width, length) => `${width || ''}|${length || ''}`;
const clone = o => JSON.parse(JSON.stringify(o));
const round2 = n => Math.round(n * 100) / 100;

function widthRange(widths) {
  const ns = widths.map(w => mm(w.width)).filter(Boolean);
  if (!ns.length) return null;
  const lo = Math.min(...ns), hi = Math.max(...ns);
  return lo === hi ? `${lo}mm` : `${lo}-${hi}mm`;
}

/** "4mm / 20"" or "20"" (a cost's quoted size) as { width, length }. */
function parseSize(size, fallbackWidth) {
  const s = String(size || '').trim();
  if (!s || /^one size$/i.test(s)) return { width: fallbackWidth || null, length: null };
  const parts = s.split('/').map(x => x.trim());
  return parts.length > 1 ? { width: parts[0], length: parts[1] } : { width: fallbackWidth || null, length: parts[0] };
}

/** A product's video as a width's { video, videoPoster }, or nothing. */
const videoOf = p => (p && p.video ? { video: p.video, ...(p.videoPoster ? { videoPoster: p.videoPoster } : {}) } : {});
/** Whether a product has photos per colour (Silver, Gold, Rose Gold...). */
const hasCols = p => !!(p && Array.isArray(p.col) && p.col.length);
// Only worth keeping for a product made in more than one colour.
const hasColourPhotos = p => !!(p && p.imagesByColor && Array.isArray(p.col) && p.col.length > 1 && Object.values(p.imagesByColor).some(a => Array.isArray(a) && a.length));

/** The cheapest live price, and whether every size costs the same. */
function derived(p) {
  const prices = (p.widths || [{ variants: p.variants || [] }]).filter(w => !w.hidden)
    .flatMap(w => (w.variants || []).map(v => v.priceAUD)).filter(n => n > 0);
  const all = (p.widths || [{ variants: p.variants || [] }]).flatMap(w => (w.variants || []).map(v => v.priceAUD)).filter(n => n > 0);
  const use = prices.length ? prices : all;
  return { fromPriceAUD: use.length ? Math.min(...use) : 0, singlePrice: new Set(all).size === 1 && !p.widths };
}

/**
 * The whole migration as a list of writes, from the current data. Pure: the
 * tests call it with plain objects.
 * @param {{ products: object[], costs: object[], pieces: object[], reviews: object|null, assumptions: object|null }} data
 * @param {{ sheet?: { settings?: object, rows: object[] }, applyPrices?: boolean, addSizes?: boolean, skip?: string[] }} opts
 */
export function buildPlan(data, opts = {}) {
  const products = data.products.map(clone);
  const byId = new Map(products.map(p => [p.id, p]));
  const costs = new Map((data.costs || []).map(c => [c.id, clone(c)]));
  const skip = new Set(opts.skip || []);
  const writes = new Map(); // "collection/id" -> { collection, id, data, merge }
  const put = (collection, id, doc, merge = false) => writes.set(`${collection}/${id}`, { collection, id, data: doc, merge });
  const report = { groups: [], sets: [], costs: { matched: 0, unmatched: [], priceChanges: [], newSizes: [], products: [] }, pieces: [], reviews: 0, notes: [] };

  // ---- 1. Merge same-name products into one with widths.
  const candidates = products.filter(p => !p.archived && !p.mergedInto && !isTitan(p) && !isSet(p));
  const byName = new Map();
  for (const p of candidates) byName.set(p.name.trim(), [...(byName.get(p.name.trim()) || []), p]);
  const moved = new Map(); // old id -> { id, width }

  for (const [name, docs] of byName) {
    if (docs.length < 2) continue;
    const existing = docs.find(p => hasWidths(p));
    const targetId = existing ? existing.id : (byId.has(slug(name)) && !docs.some(d => d.id === slug(name)) ? `${slug(name)}-all` : slug(name));
    const group = { id: targetId, name, from: docs.filter(d => d.id !== targetId).map(d => ({ id: d.id, width: d.width || null, status: d.hidden ? 'Coming soon' : 'Live' })), widths: [], skipped: skip.has(targetId), isNew: !existing };
    report.groups.push(group);
    if (group.skipped) continue;

    const sources = docs.filter(d => d.id !== targetId).sort((a, b) => mm(a.width) - mm(b.width));
    const live = sources.filter(d => !d.hidden).sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const lead = existing || live[0] || [...sources].sort((a, b) => (a.sort || 0) - (b.sort || 0))[0];
    const widths = existing ? clone(existing.widths) : [];
    for (const s of sources) {
      if (!s.width) { report.notes.push(`${s.id} has no width, left as it is.`); continue; }
      const have = widths.find(w => w.width === s.width);
      if (have) {
        // The merged product already sells this width (the tennis pieces); the old document only becomes a link.
        if (!have.images && Array.isArray(s.images) && s.images.length > 1) have.images = s.images;
        if (!have.imagesByColor && hasColourPhotos(s)) have.imagesByColor = clone(s.imagesByColor);
        if (!have.col && hasCols(s)) have.col = [...s.col];
        if (have.video === undefined && s.video) Object.assign(have, videoOf(s));
        continue;
      }
      widths.push({
        width: s.width,
        ...(s.images && s.images.length ? { image: s.images[0], images: s.images } : {}),
        ...(hasColourPhotos(s) ? { imagesByColor: clone(s.imagesByColor) } : {}),
        ...(hasCols(s) ? { col: [...s.col] } : {}),
        ...videoOf(s),
        ...(s.hidden ? { hidden: true } : {}),
        variants: clone(s.variants || []),
      });
    }
    // The lead product's own colour photos belong to its width.
    const leadW = widths.find(w => w.width === lead.width);
    if (leadW && !leadW.imagesByColor && hasColourPhotos(lead)) leadW.imagesByColor = clone(lead.imagesByColor);
    if (leadW && !leadW.col && hasCols(lead)) leadW.col = [...lead.col];
    // ...and so does its video: each width shows its own (the 5mm Iced Cuban Bracelet's clip).
    if (leadW && leadW.video === undefined && lead.video) Object.assign(leadW, videoOf(lead));
    widths.sort((a, b) => mm(a.width) - mm(b.width));
    group.widths = widths.map(w => ({ width: w.width, status: w.hidden ? 'Coming soon' : 'Live', sizes: (w.variants || []).length }));

    const all = existing ? [existing, ...sources] : sources;
    const coll = [...new Set(all.flatMap(d => d.coll || []))];
    // A collection only some widths were in (e.g. "15mm Cuban") opens the product on that width.
    const collWidth = { ...(existing && existing.collWidth) };
    for (const c of coll) {
      const inIt = sources.filter(d => (d.coll || []).includes(c));
      if (!existing && inIt.length && inIt.length < sources.length) collWidth[c] = inIt[0].width;
    }
    const { id: _i, sort: _s, updatedAt: _u, width: _w, variants: _v, linkTo: _l, ...base } = lead;
    const merged = {
      ...base,
      id: targetId,
      name,
      width: widthRange(widths),
      // Every colour any width comes in (cards and search); each width keeps its own in w.col.
      ...(widths.some(w => w.col) ? { col: [...new Set(widths.flatMap(w => w.col || base.col || []))] } : {}),
      widths,
      defaultWidth: (existing && existing.defaultWidth) || lead.width || widths.find(w => !w.hidden)?.width || widths[0]?.width,
      coll,
      ...(Object.keys(collWidth).length ? { collWidth } : {}),
      hidden: widths.every(w => w.hidden),
      archived: false,
      sort: existing ? existing.sort || 0 : Math.min(...sources.map(d => d.sort || 0)),
    };
    // The lead's video now lives on its width, not on the whole product.
    if (!existing && leadW && leadW.video && merged.video === leadW.video) { delete merged.video; delete merged.videoPoster; }
    if (existing && existing.linkTo) merged.linkTo = existing.linkTo;
    if (existing && existing.variants) merged.variants = existing.variants; // older pages read these too
    delete merged.mergedInto;
    Object.assign(merged, derived(merged));
    byId.set(targetId, { ...merged, id: targetId });
    put('products', targetId, { ...merged, updatedAt: FieldValue.serverTimestamp() });

    // The merged product's costs: each old product's quoted cost becomes the cost of that size.
    const cost = { id: targetId, name, ...(costs.get(targetId) || {}) };
    cost.variants = { ...(cost.variants || {}) };
    if (existing && cost.factoryCostAUD != null) {
      const sz = parseSize(cost.representativeSize, existing.defaultWidth);
      if (sz.width) cost.variants[costKey(sz.width, sz.length)] ||= { factoryCostAUD: cost.factoryCostAUD, estimated: !!cost.factoryCostEstimated, basis: 'Earlier cost' };
    }
    for (const s of sources) {
      const c = costs.get(s.id);
      if (!c || c.factoryCostAUD == null) continue;
      const sz = parseSize(c.representativeSize, s.width);
      cost.variants[costKey(s.width, sz.length || (s.variants && s.variants[0] && s.variants[0].length))] = { factoryCostAUD: c.factoryCostAUD, estimated: !!c.factoryCostEstimated, basis: 'Earlier cost' };
    }
    costs.set(targetId, cost);

    for (const s of sources) {
      moved.set(s.id, { id: targetId, width: s.width || null });
      put('products', s.id, { archived: true, mergedInto: { id: targetId, width: s.width || null }, updatedAt: FieldValue.serverTimestamp() }, true);
      byId.set(s.id, { ...s, archived: true, mergedInto: { id: targetId, width: s.width || null } });
    }
  }

  // Registry pieces and review videos follow their product.
  for (const piece of data.pieces || []) {
    const to = moved.get(piece.productId);
    if (!to) continue;
    const size = piece.size && to.width && !String(piece.size).includes(to.width) ? `${to.width} · ${piece.size}` : (piece.size || to.width || '');
    const variant = [size, piece.colour].filter(Boolean).join(' · ');
    put('pieces', piece.key || piece.id, { productId: to.id, productIdBefore: piece.productId, size, variant, updatedAt: FieldValue.serverTimestamp() }, true);
    report.pieces.push({ serial: piece.serial || piece.key || piece.id, from: piece.productId, to: to.id, size });
  }
  if (data.reviews && Array.isArray(data.reviews.videos) && data.reviews.videos.some(v => moved.has(v.productId))) {
    const videos = data.reviews.videos.map(v => (moved.has(v.productId) ? { ...v, productId: moved.get(v.productId).id } : v));
    report.reviews = data.reviews.videos.filter(v => moved.has(v.productId)).length;
    put('site', 'reviews', { videos, updatedAt: FieldValue.serverTimestamp() }, true);
  }

  // ---- 1b. Colours, colour photos and videos for products merged by an earlier run, which kept only
  // each width's default photos and the lead product's colours and video. The old documents still hold
  // them, so copy them onto their width.
  for (const src of products) {
    const to = src.mergedInto;
    // A target merged in this same run already has them (step 1).
    if (!to || !to.id || !to.width || writes.has(`products/${to.id}`)) continue;
    const target = byId.get(to.id);
    if (!target || !Array.isArray(target.widths)) continue;
    const w = target.widths.find(x => x && x.width === to.width);
    if (!w) continue;
    const fixed = [];
    if (!w.imagesByColor && hasColourPhotos(src)) { w.imagesByColor = clone(src.imagesByColor); fixed.push('colour photos'); }
    if (!w.col && hasCols(src)) { w.col = [...src.col]; fixed.push(`colours (${src.col.join(', ')})`); }
    if (w.video === undefined && src.video) { Object.assign(w, videoOf(src)); fixed.push('video'); }
    if (!fixed.length) continue;
    report.notes.push(`${target.name} ${to.width}: ${fixed.join(' and ')} brought back from ${src.id}.`);
    (report.photoRepairs ||= new Set()).add(to.id);
  }
  for (const id of report.photoRepairs || []) {
    const t = byId.get(id);
    // A video the lead product brought to the whole product is now on its width only.
    const own = t.video && t.widths.some(w => w && w.video === t.video);
    put('products', id, { widths: t.widths, ...(own ? { video: FieldValue.delete(), videoPoster: FieldValue.delete() } : {}), updatedAt: FieldValue.serverTimestamp() }, true);
  }
  report.photoRepairs = [...(report.photoRepairs || [])];

  // ---- 2. Sets that list their products become real sets, at the same price.
  for (const p of products) {
    if (p.archived || !isSet(p)) continue;
    const cur = byId.get(p.id) || p;
    if (cur.set) { report.sets.push({ id: p.id, name: p.name, action: 'Already a set' }); continue; }
    const ids = (p.bundleOf || []).map(id => (moved.get(id) ? moved.get(id).id : id));
    if (!ids.length || ids.some(id => !byId.has(id))) {
      report.sets.push({ id: p.id, name: p.name, action: 'Add its pieces in the set editor', status: p.hidden ? 'Coming soon' : 'Live' });
      continue;
    }
    const components = ids.map((id, i) => {
      const cp = byId.get(id);
      // "Classic Tennis Chain, 4mm · 20"" in the old list: the size that set was sold in.
      const m = /,\s*([\d.]+mm)(?:\s*·\s*(.+))?$/.exec((p.bundle || [])[i] || '');
      const width = hasWidths(cp) ? (m ? m[1] : (moved.get((p.bundleOf || [])[i]) || {}).width || cp.defaultWidth || null) : null;
      const length = cp.singlePrice ? null : (m && m[2] ? m[2].trim() : null);
      return { productId: id, width, length };
    });
    const price = (p.variants || [])[0] ? p.variants[0].priceAUD : 0;
    const set = { components, sharedWidth: false, pricing: { mode: 'fixed', priceAUD: price } };
    const from = setFromPrice({ ...p, set }, id => byId.get(id) || null);
    put('products', p.id, { set, bundleOf: ids, updatedAt: FieldValue.serverTimestamp(), ...(from ? { fromPriceAUD: from } : {}) }, true);
    byId.set(p.id, { ...p, set });
    report.sets.push({ id: p.id, name: p.name, action: `Set of ${components.map(c => byId.get(c.productId).name + (c.width || c.length ? ` (${[c.width, c.length].filter(Boolean).join(' · ')})` : '')).join(' + ')}, A$${price}`, status: p.hidden ? 'Coming soon' : 'Live' });
  }

  // ---- 3. The cost spreadsheet.
  const sheet = opts.sheet;
  if (sheet && Array.isArray(sheet.rows)) {
    const st = sheet.settings || {};
    const usdPerAud = Number(st.usdPerAud) > 0 ? Number(st.usdPerAud) : 0.6841;
    if (st.usdPerAud || st.freightUSD != null || st.gstPct != null) {
      put('internal', 'costAssumptions', {
        ...(st.usdPerAud ? { usdPerAud } : {}),
        ...(st.freightUSD != null ? { freightUSD: Number(st.freightUSD) } : {}),
        ...(st.gstPct != null ? { gstPct: Number(st.gstPct) } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, true);
    }
    const byNameNow = new Map([...byId.values()].filter(p => !p.archived).map(p => [p.name.trim(), p]));
    const touched = new Set();
    for (const row of sheet.rows) {
      const name = FAMILY_PRODUCTS[row.family];
      const p = name && byNameNow.get(name);
      const label = [row.family, row.width, row.length].filter(Boolean).join(' · ');
      if (!p) { report.costs.unmatched.push({ row: label, why: name ? `No product called ${name}` : 'Not linked to a product' }); continue; }
      const many = hasWidths(p);
      let w = many ? p.widths.find(x => x.width === row.width) : (!row.width || !p.width || row.width === p.width ? { width: p.width, variants: p.variants || [] } : null);
      const findV = () => (w ? (w.variants || []).find(v => (v.length || null) === (row.length || null)) || (p.singlePrice && !row.length ? w.variants[0] : null) : null);
      let v = findV();
      if (!v && opts.addSizes && row.retailAUD > 0 && (many || w)) {
        // A size the site doesn't sell yet. A new width starts as Coming soon.
        if (!w) { w = { width: row.width, hidden: true, variants: [] }; p.widths.push(w); p.widths.sort((a, b) => mm(a.width) - mm(b.width)); }
        v = { length: row.length || null, priceAUD: row.retailAUD };
        w.variants.push(v);
        w.variants.sort((a, b) => inches(a.length) - inches(b.length));
        report.costs.newSizes.push({ product: p.name, size: [row.width, row.length].filter(Boolean).join(' · '), priceAUD: row.retailAUD, status: w.hidden ? 'Coming soon' : 'Live' });
        touched.add(p.id);
      } else if (!v) {
        report.costs.unmatched.push({ row: label, why: `${p.name} doesn't sell this size` });
        continue;
      } else if (opts.applyPrices && row.retailAUD > 0 && v.priceAUD !== row.retailAUD) {
        report.costs.priceChanges.push({ product: p.name, size: [row.width, row.length].filter(Boolean).join(' · ') || 'One size', from: v.priceAUD, to: row.retailAUD });
        v.priceAUD = row.retailAUD;
        touched.add(p.id);
      }
      const cost = costs.get(p.id) || { id: p.id, name: p.name };
      cost.variants = { ...(cost.variants || {}) };
      const key = costKey(many ? row.width : p.width, row.length);
      cost.variants[key] = {
        ...(row.factoryUSD != null ? { factoryCostUSD: Number(row.factoryUSD), factoryCostAUD: round2(Number(row.factoryUSD) / usdPerAud) } : { factoryCostUSD: null, factoryCostAUD: null }),
        estimated: !!row.estimated,
        basis: row.basis || '',
        ...(row.note ? { notes: row.note } : {}),
        ...(row.retailAUD ? { sheetRetailAUD: Number(row.retailAUD) } : {}),
      };
      costs.set(p.id, cost);
      report.costs.matched++;
      if (!report.costs.products.includes(p.name)) report.costs.products.push(p.name);
    }
    for (const id of touched) {
      const p = byId.get(id);
      Object.assign(p, derived(p));
      const w = writes.get(`products/${id}`);
      const fields = { ...(p.widths ? { widths: p.widths } : { variants: p.variants }), fromPriceAUD: p.fromPriceAUD, singlePrice: p.singlePrice, updatedAt: FieldValue.serverTimestamp() };
      if (w) Object.assign(w.data, fields); else put('products', id, fields, true);
    }
  }

  // Every cost record that changed, with its default size's cost kept in the old fields for older screens.
  for (const [id, c] of costs) {
    const was = (data.costs || []).find(x => x.id === id);
    if (was && JSON.stringify(was.variants || {}) === JSON.stringify(c.variants || {})) continue;
    if (!c.variants || !Object.keys(c.variants).length) continue;
    const p = byId.get(id);
    const sizes = Object.entries(c.variants).filter(([, v]) => v.factoryCostAUD != null);
    const want = p && p.widths ? costKey(p.defaultWidth, (p.widths.find(w => w.width === p.defaultWidth) || {}).variants?.[0]?.length) : null;
    const [k, v] = sizes.find(([key]) => key === want) || sizes[0] || [];
    const [kw, kl] = (k || '|').split('|');
    put('productCosts', id, {
      id, name: c.name || (p && p.name) || id, variants: c.variants,
      ...(v ? { factoryCostAUD: v.factoryCostAUD, factoryCostEstimated: !!v.estimated, representativeSize: p && p.widths ? `${kw} / ${kl || 'one size'}` : (kl || 'one size') } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, true);
  }

  return { writes: [...writes.values()], report };
}

const plain = v => JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x === 'object' && x.constructor && x.constructor.name === 'Timestamp' ? x.toDate().toISOString() : x)));

async function loadData() {
  const [products, costs, pieces, reviews, assumptions] = await Promise.all([
    db.collection('products').get(),
    db.collection('productCosts').get(),
    db.collection('pieces').get(),
    db.doc('site/reviews').get(),
    db.doc('internal/costAssumptions').get(),
  ]);
  return {
    products: products.docs.map(d => ({ ...d.data(), id: d.id })),
    costs: costs.docs.map(d => ({ ...d.data(), id: d.id })),
    pieces: pieces.docs.map(d => ({ ...d.data(), key: d.id })),
    reviews: reviews.exists ? reviews.data() : null,
    assumptions: assumptions.exists ? assumptions.data() : null,
  };
}

/** A fingerprint of the writes, so apply can tell the data hasn't changed since the preview. */
const fingerprint = writes => createHash('sha256').update(JSON.stringify(writes.map(w => [w.collection, w.id, plain(w.data)]))).digest('hex').slice(0, 16);

function cleanOpts(b) {
  const sheet = b && b.sheet && Array.isArray(b.sheet.rows) ? {
    settings: b.sheet.settings || {},
    rows: b.sheet.rows.slice(0, 2000).map(r => ({
      family: String(r.family || '').slice(0, 80), width: r.width ? String(r.width).slice(0, 20) : null, length: r.length ? String(r.length).slice(0, 20) : null,
      factoryUSD: r.factoryUSD == null || r.factoryUSD === '' ? null : Number(r.factoryUSD), retailAUD: Number(r.retailAUD) || 0,
      basis: String(r.basis || '').slice(0, 80), note: String(r.note || '').slice(0, 300), estimated: !!r.estimated,
    })),
  } : null;
  return { sheet, applyPrices: !!(b && b.applyPrices), addSizes: !!(b && b.addSizes), skip: Array.isArray(b && b.skip) ? b.skip.map(String).slice(0, 50) : [] };
}

export async function previewMigration(body) {
  const opts = cleanOpts(body);
  const { writes, report } = buildPlan(await loadData(), opts);
  return { fingerprint: fingerprint(writes), writes: writes.length, report };
}

export async function applyMigration(body, by) {
  const opts = cleanOpts(body);
  const { writes, report } = buildPlan(await loadData(), opts);
  if (!writes.length) throw new HttpError(400, 'Nothing to change.');
  if (fingerprint(writes) !== body.fingerprint) throw new HttpError(409, 'Something changed since the preview. Run the preview again and check it.');

  const run = db.collection('migrations').doc();
  // A copy of every document before it changes, so the run can be undone.
  const before = await Promise.all(writes.map(w => db.collection(w.collection).doc(w.id).get()));
  await run.set({ kind: 'variants', status: 'applying', by, createdAt: FieldValue.serverTimestamp(), writes: writes.length, summary: summarise(report) });
  for (let i = 0; i < before.length; i += 400) {
    const b = db.batch();
    before.slice(i, i + 400).forEach((snap, k) => b.set(run.collection('before').doc(String(i + k)), {
      collection: writes[i + k].collection, id: writes[i + k].id, existed: snap.exists, data: snap.exists ? snap.data() : null,
    }));
    await b.commit();
  }
  for (let i = 0; i < writes.length; i += 400) {
    const b = db.batch();
    writes.slice(i, i + 400).forEach(w => b.set(db.collection(w.collection).doc(w.id), w.data, { merge: w.merge }));
    await b.commit();
  }
  await run.update({ status: 'applied', appliedAt: FieldValue.serverTimestamp() });
  await syncPieces(writes);
  return { runId: run.id, writes: writes.length };
}

/** Portal copies of moved pieces that belong to a customer. Best effort. */
async function syncPieces(writes) {
  for (const w of writes.filter(x => x.collection === 'pieces')) {
    await syncPiece(w.id).catch(err => console.warn('migration: piece copy not updated', w.id, err.message));
  }
}

export async function undoMigration(runId, by) {
  const run = db.collection('migrations').doc(String(runId || '').slice(0, 100));
  const snap = await run.get();
  if (!snap.exists) throw new HttpError(404, 'Migration not found');
  if (snap.get('status') !== 'applied') throw new HttpError(409, 'Only an applied migration can be undone.');
  const before = await run.collection('before').get();
  const docs = before.docs.map(d => d.data());
  for (let i = 0; i < docs.length; i += 400) {
    const b = db.batch();
    docs.slice(i, i + 400).forEach(d => {
      const ref = db.collection(d.collection).doc(d.id);
      if (d.existed) b.set(ref, d.data); else b.delete(ref);
    });
    await b.commit();
  }
  await run.update({ status: 'undone', undoneAt: FieldValue.serverTimestamp(), undoneBy: by });
  await syncPieces(docs.map(d => ({ collection: d.collection, id: d.id })));
  return { restored: docs.length };
}

export async function listMigrations() {
  const snap = await db.collection('migrations').orderBy('createdAt', 'desc').limit(20).get();
  return { runs: snap.docs.map(d => ({ id: d.id, ...plain(d.data()) })) };
}

function summarise(r) {
  return {
    merged: r.groups.filter(g => !g.skipped).map(g => `${g.name}: ${g.from.map(f => f.id).join(', ')} -> ${g.id}`),
    sets: r.sets.filter(s => s.action.startsWith('Set of')).map(s => s.id),
    costs: r.costs.matched, priceChanges: r.costs.priceChanges.length, newSizes: r.costs.newSizes.length, pieces: r.pieces.length,
  };
}
