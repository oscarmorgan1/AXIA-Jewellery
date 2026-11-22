import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Lock, Plus, Trash2 } from 'lucide-react';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, siteUrl } from '../firebase';
import { useAssumptions, useCollections, useCosts, usePieces, useProducts } from '../lib/data';
import { allPrices, slugify, statusOf, withDerivedPrices } from '../lib/catalogue';
import { economics, retailAtSize } from '../lib/economics';
import { aud, pct, timeAgo } from '../lib/format';
import ImageList from '../components/ImageList';
import ProductVideo from '../components/ProductVideo';
import VariantsTable from '../components/VariantsTable';
import SetEditor from '../components/SetEditor';
import { costOf, hasWidths, makingBySize, setRange, stockBySize } from '../lib/variants';
import { useToast } from '../components/Toast';
import ProductSales from '../components/ProductSales';
import type { Product, ProductCost, SetConfig, VariantCost, WidthOption } from '../types';
import { useConfirm } from '../components/Confirm';

const BLANK: Product = {
  id: '', name: '', desc: '', cat: 'bracelet', coll: ['cuban'], col: ['Silver'], art: 'cuban', level: 1,
  badge: null, width: null, cons: null, mto: false, hidden: true, images: [], variants: [{ length: '7"', priceAUD: 0 }],
};
const ADMIN_FIELDS = ['sort', 'updatedAt'];

const list = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);
const orNull = (s: string) => (s.trim() === '' ? null : s);

/** Strip undefined/NaN so Firestore accepts the document. */
function clean<T>(o: T): T {
  return JSON.parse(JSON.stringify(o, (_k, v) => (typeof v === 'number' && Number.isNaN(v) ? null : v)));
}

function sizeOptions(p: Product): string[] {
  if (p.widths?.length) return p.widths.flatMap(w => (w.variants || []).map(v => `${w.width} / ${v.length ?? 'one size'}`));
  const lens = (p.variants || []).map(v => v.length ?? 'one size');
  return lens.length ? (p.width ? lens.map(l => (l === 'one size' ? l : `${p.width} / ${l}`)) : lens) : ['one size'];
}

export default function ProductEdit() {
  const { id: routeId } = useParams();
  const isNew = !routeId;
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: products } = useProducts();
  const { data: assumptions } = useAssumptions();
  const { data: collections } = useCollections();
  const { byId: allCosts } = useCosts();
  const { data: pieces } = usePieces();

  const [draft, setDraft] = useState<Product | null>(isNew ? { ...BLANK } : null);
  const [cost, setCostState] = useState<Partial<ProductCost>>({});
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Load once (not live) so in-progress edits aren't overwritten by snapshots.
  useEffect(() => {
    if (isNew) { setDraft({ ...BLANK }); setCostState({}); return; }
    let off = false;
    (async () => {
      const [ps, cs] = await Promise.all([getDoc(doc(db, 'products', routeId!)), getDoc(doc(db, 'productCosts', routeId!))]);
      if (off) return;
      if (!ps.exists()) { setNotFound(true); return; }
      setDraft({ ...(ps.data() as Product), id: ps.id });
      setCostState((cs.data() as ProductCost) || {});
    })().catch(e => setError(e.message));
    return () => { off = true; };
  }, [routeId, isNew]);

  const id = isNew ? slugify(draft?.name || '') : routeId!;
  const set = (patch: Partial<Product>) => setDraft(d => (d ? { ...d, ...patch } : d));
  const status = draft ? statusOf(draft) : 'Live';

  const live = useMemo(() => {
    if (!draft) return null;
    const p = withDerivedPrices(draft);
    return economics(retailAtSize(p, cost.representativeSize), cost.factoryCostAUD ?? null, assumptions);
  }, [draft, cost, assumptions]);
  const perSize = !!(cost.variants && Object.keys(cost.variants).length);
  const stock = useMemo(() => stockBySize(pieces, routeId || ''), [pieces, routeId]);
  const making = useMemo(() => makingBySize(pieces, routeId || ''), [pieces, routeId]);
  const aliases = useMemo(() => products.filter(p => p.mergedInto?.id === routeId).map(p => p.id), [products, routeId]);
  const setCost = (key: string, v: VariantCost | null) => setCostState(c => {
    const variants = { ...(c.variants || {}) };
    if (v) variants[key] = v; else delete variants[key];
    return { ...c, variants };
  });

  if (notFound) return <div className="card empty"><b>Product not found</b><Link className="btn" to="/products">Back to products</Link></div>;
  if (!draft) return <div className="card empty">Loading…</div>;

  const setStatus = (s: 'Live' | 'Coming soon' | 'Archived') =>
    set({ hidden: s === 'Coming soon', archived: s === 'Archived' });

  const setWidth = (i: number, patch: Partial<WidthOption>) =>
    set({ widths: (draft.widths || []).map((w, k) => (k === i ? { ...w, ...patch } : w)) });

  async function save() {
    setError(null);
    let p = withDerivedPrices({ ...draft!, id });
    if (!p.name.trim()) return setError('Name is required.');
    if (!id) return setError('Name must contain letters or numbers.');
    if (p.set) {
      // A set: checkout prices it from its pieces. The cards need its From price, and the
      // old bundle fields keep older pages listing what's inside.
      const comps = p.set.components.filter(c => c.productId);
      if (!comps.length) return setError('Add the pieces in this set.');
      const range = setRange({ ...p.set, components: comps }, x => products.find(q => q.id === x));
      if (!range || !(range.from > 0)) return setError('The set needs a price above zero for every size the buyer can pick. Check the pieces and the price.');
      p = {
        ...p, set: { ...p.set, components: comps },
        variants: [{ length: null, priceAUD: range.from }], widths: undefined, fromPriceAUD: range.from, singlePrice: range.from === range.to,
        bundleOf: comps.map(c => c.productId),
        bundle: comps.map(c => { const q = products.find(x => x.id === c.productId); return [q?.name || c.productId, [c.width, c.length].filter(Boolean).join(' · ')].filter(Boolean).join(', '); }),
      };
    }
    const prices = allPrices(p);
    if (!prices.length) return setError('Add at least one size with a price.');
    if (prices.some(n => !(n > 0))) return setError('Every size needs a price above zero.');
    if (isNew && products.some(x => x.id === id)) return setError(`A product with the id "${id}" already exists. Change the name.`);

    const out: Record<string, unknown> = clean(p);
    ADMIN_FIELDS.forEach(k => delete out[k]);
    out.sort = isNew ? Math.max(0, ...products.map(x => x.sort ?? 0)) + 10 : (draft!.sort ?? 0);
    out.archived = !!p.archived;
    out.updatedAt = serverTimestamp();

    setSaving(true);
    try {
      const b = writeBatch(db);
      b.set(doc(db, 'products', id), out, { merge: false });
      const hasCost = cost.factoryCostAUD != null || cost.representativeSize || cost.notes || perSize;
      if (hasCost) {
        // With costs per size, the one-cost fields follow the default size, for screens that read those.
        let single = { representativeSize: cost.representativeSize ?? null, factoryCostAUD: cost.factoryCostAUD ?? null, factoryCostEstimated: !!cost.factoryCostEstimated };
        if (perSize) {
          const w = hasWidths(p) ? (p.widths!.find(x => x.width === p.defaultWidth) || p.widths![0]) : null;
          const vs = w ? w.variants : p.variants || [];
          const l = (vs.find(v => v.length === (p.defaultLength || (p.cat === 'chain' ? '20"' : '7"'))) || vs[0])?.length ?? null;
          const vc = costOf(cost as ProductCost, w ? w.width : p.width, l);
          if (vc && vc.factoryCostAUD != null) single = { representativeSize: w ? `${w.width} / ${l || 'one size'}` : (l || 'one size'), factoryCostAUD: vc.factoryCostAUD, factoryCostEstimated: !!vc.estimated };
        }
        b.set(doc(db, 'productCosts', id), {
          ...clean({
            id, name: p.name, ...single,
            ...(cost.category !== undefined ? { category: cost.category } : {}),
            notes: cost.notes || '',
            ...(perSize ? { variants: cost.variants } : {}),
          }),
          updatedAt: serverTimestamp(),
        }, { merge: !perSize });
      }
      await b.commit();
      toast.show('Saved. The storefront now shows this version.');
      if (isNew) nav(`/products/${encodeURIComponent(id)}`, { replace: true });
      else setDraft(d => (d ? { ...p, sort: d.sort, updatedAt: { toDate: () => new Date() } } : d));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function destroy() {
    if (!(await confirm({ title: `Permanently delete “${draft!.name}”?`, tone: 'danger', word: 'DELETE', confirmLabel: 'Delete for good',
      body: 'This removes the product and its cost record. Archiving can be undone; this can’t.' }))) return;
    const b = writeBatch(db);
    b.delete(doc(db, 'products', id));
    b.delete(doc(db, 'productCosts', id));
    try { await b.commit(); } catch (e) { return setError((e as Error).message); }
    nav('/products');
  }

  function applyJson() {
    try {
      const parsed = JSON.parse(json) as Product;
      if (typeof parsed !== 'object' || !parsed) throw new Error('Not an object');
      const forbidden = ['economics', 'factory_cost_AUD', 'factoryCostAUD', 'cost'].filter(k => k in parsed);
      if (forbidden.length) throw new Error(`Cost fields (${forbidden.join(', ')}) can't go on the public product. Use the cost panel.`);
      setDraft({ ...parsed, id: draft!.id, sort: draft!.sort, updatedAt: draft!.updatedAt });
      setError(null);
      toast.show('JSON applied to the form. Save to publish.');
    } catch (e) { setError(`JSON: ${(e as Error).message}`); }
  }

  const productUrl = draft.linkTo ? siteUrl(draft.linkTo) : siteUrl(`product?id=${encodeURIComponent(id)}`);
  const colourGroups = Object.entries(draft.imagesByColor || {});

  return (
    <>
      <div className="page-head">
        <Link to="/products" className="icon-btn" aria-label="Back"><ArrowLeft size={18} /></Link>
        <h1>{isNew ? 'New product' : draft.name || 'Untitled'}</h1>
        <span className={`chip ${status === 'Live' ? 'chip--good' : status === 'Archived' ? 'chip--bad' : 'chip--warn'}`}>{status}</span>
        <span className="spacer" />
        {!isNew && <a className="btn" href={productUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> View on site</a>}
        <button className="btn btn--primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      {error && <div className="notice notice--error">{error}</div>}

      <div className="editor">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <div className="card">
            <div className="card__head"><h2>Details</h2></div>
            <div className="form-grid">
              <label className="field full">Name<input className="input" value={draft.name} onChange={e => set({ name: e.target.value })} /></label>
              <label className="field">Product id (URL)<input className="input" value={id} disabled /></label>
              <label className="field">Badge<input className="input" value={draft.badge ?? ''} placeholder="e.g. First Drop" onChange={e => set({ badge: orNull(e.target.value) })} /></label>
              <label className="field full">Description<textarea className="textarea" value={draft.desc ?? ''} onChange={e => set({ desc: e.target.value })} /></label>
              <label className="field">Type
                <select className="select" value={draft.cat ?? ''} onChange={e => set({ cat: e.target.value })}>
                  <option value="chain">Chain</option><option value="bracelet">Bracelet</option><option value="pendant">Pendant</option>
                </select>
              </label>
              <label className="field">Artwork style
                <select className="select" value={draft.art ?? 'cuban'} onChange={e => set({ art: e.target.value })}>
                  <option value="cuban">Cuban</option><option value="tennis">Tennis</option><option value="cross">Cross</option>
                </select>
              </label>
              <label className="field">Width<input className="input" value={draft.width ?? ''} placeholder="e.g. 15mm" onChange={e => set({ width: orNull(e.target.value) })} /></label>
              <label className="field">Construction<input className="input" value={draft.cons ?? ''} placeholder="e.g. prong, baguette" onChange={e => set({ cons: orNull(e.target.value) })} /></label>
              <label className="field">Colours (comma separated)<input className="input" value={(draft.col || []).join(', ')} onChange={e => set({ col: list(e.target.value) })} /></label>
              <label className="field">Stone<input className="input" value={draft.stone ?? ''} placeholder="e.g. VVS D-colour moissanite" onChange={e => set({ stone: e.target.value || undefined })} /></label>
              <div className="field full">Collections
                <div className="tags" style={{ paddingTop: 4 }}>
                  {collections.map(c => {
                    const on = (draft.coll || []).includes(c.slug);
                    return (
                      <button type="button" key={c.slug} className={`tag-toggle${on ? ' on' : ''}`}
                        onClick={() => set({ coll: on ? (draft.coll || []).filter(x => x !== c.slug) : [...(draft.coll || []), c.slug] })}>
                        {c.name}
                      </button>
                    );
                  })}
                  <Link to="/collections" className="tag-toggle" style={{ borderStyle: 'dashed' }}>+ New collection</Link>
                </div>
              </div>
            </div>
          </div>

          {draft.mergedInto?.id && (
            <div className="notice notice--warn">
              Merged into <Link to={`/products/${encodeURIComponent(draft.mergedInto.id)}`}>{products.find(x => x.id === draft.mergedInto!.id)?.name || draft.mergedInto.id}</Link>
              {draft.mergedInto.width ? ` as its ${draft.mergedInto.width} width` : ''}. Kept so past orders and old links still work; links to it open the merged product.
            </div>
          )}
          <div className="card">
            <div className="card__head">
              <div><h2>{draft.set ? 'Set' : 'Pricing'}</h2><div className="card__sub">{draft.set ? 'The pieces in this set, which sizes the buyer picks, and its price.' : 'From-price is worked out from the cheapest size on sale when you save. Costs are private and never reach the storefront.'}</div></div>
              <span className="spacer" />
              <label className="check"><input type="checkbox" checked={!!draft.set} onChange={e => set({ set: e.target.checked ? ({ components: [], sharedWidth: false, pricing: { mode: 'fixed', priceAUD: draft.fromPriceAUD || 0 } } as SetConfig) : null })} /> This is a set</label>
              {!draft.set && (
                <label className="field" style={{ width: 170 }}>Compare-at (A$)
                  <input className="input" type="number" min="0" value={draft.compareAtAUD ?? ''} onChange={e => set({ compareAtAUD: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </label>
              )}
            </div>
            {draft.set ? (
              <SetEditor value={draft.set} onChange={v => set({ set: v })} products={products} costs={allCosts} assumptions={assumptions} selfId={id} />
            ) : draft.widths?.length ? (
              <>
                {draft.widths.map((w, i) => (
                  <div className={`width-block${w.hidden ? ' width-block--soon' : ''}`} key={i}>
                    <div className="width-block__head">
                      <label className="field">Width<input className="input" value={w.width} onChange={e => setWidth(i, { width: e.target.value })} /></label>
                      <label className="field">Photo path / URL<input className="input" value={w.image ?? ''} onChange={e => setWidth(i, { image: e.target.value || undefined })} /></label>
                      <WidthColours value={w.col} all={draft.col || []} onChange={col => setWidth(i, { col })} />
                      <label className="check" style={{ paddingBottom: 8 }}><input type="checkbox" checked={!!w.hidden} onChange={e => setWidth(i, { hidden: e.target.checked || undefined })} /> Coming soon</label>
                    </div>
                    {w.images && w.images.length > 1 && <div className="card__sub" style={{ marginBottom: 8 }}>{w.images.length} photos for this width (from the product it was merged from).</div>}
                    <VariantsTable variants={w.variants || []} onChange={v => setWidth(i, { variants: v })}
                      cost={{ width: w.width, costs: cost.variants || {}, onCost: setCost, assumptions, stock, making }} />
                    {(w.col || draft.col || []).length > 1 && (
                      <details className="width-block__photos">
                        <summary>Photos by colour for {w.width || 'this width'}{w.imagesByColor ? '' : ' (not set, every colour shows the photos above)'}</summary>
                        {(w.col || draft.col || []).map((colour, k) => (
                          <div key={colour} style={{ marginTop: 14 }}>
                            <div className="card__sub" style={{ marginBottom: 8, color: 'var(--ink)', fontWeight: 500 }}>{colour}</div>
                            <ImageList productId={id} images={w.imagesByColor?.[colour] ?? (k === 0 ? (w.images || (w.image ? [w.image] : [])) : [])} onError={setError}
                              onChange={next => setWidth(i, { imagesByColor: { ...w.imagesByColor, [colour]: next } })} />
                          </div>
                        ))}
                      </details>
                    )}
                    <details className="width-block__photos" open={!!w.video}>
                      <summary>Video for {w.width || 'this width'}{w.video ? '' : (draft.video && !draft.widths!.some(x => x.video === draft.video) ? ' (not set, shows the product video below)' : ' (not set)')}</summary>
                      <div style={{ marginTop: 14 }}>
                        <ProductVideo productId={id} width={w.width} video={w.video} poster={w.videoPoster} onError={setError}
                          help={`Shown on the product page while ${w.width || 'this width'} is picked, as the last thumbnail. Converted to a small 720p file with no sound, at most 30 seconds.`}
                          onChange={v => setWidth(i, v)} />
                      </div>
                    </details>
                    <div className="width-block__foot">
                      <button type="button" className="btn btn--sm btn--danger" onClick={() => set({ widths: draft.widths!.filter((_, k) => k !== i) })}><Trash2 size={14} /> Remove width</button>
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn--sm" onClick={() => set({ widths: [...draft.widths!, { width: '', hidden: true, variants: [{ length: '', priceAUD: 0 }] }] })}><Plus size={14} /> Add width</button>
                  <label className="field" style={{ width: 160 }}>Default width
                    <select className="select" value={draft.defaultWidth ?? ''} onChange={e => set({ defaultWidth: e.target.value || undefined })}>
                      <option value="">First</option>{draft.widths.map(w => <option key={w.width}>{w.width}</option>)}
                    </select>
                  </label>
                </div>
              </>
            ) : (
              <>
                <VariantsTable variants={draft.variants || []} onChange={v => set({ variants: v })}
                  cost={{ width: draft.width ?? null, costs: cost.variants || {}, onCost: setCost, assumptions, stock, making }} />
                <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginTop: 12 }}>
                  <label className="field" style={{ width: 200 }}>Default length
                    <select className="select" value={draft.defaultLength ?? ''} onChange={e => set({ defaultLength: e.target.value || undefined })}>
                      <option value="">First</option>{(draft.variants || []).filter(v => v.length).map(v => <option key={v.length!}>{v.length}</option>)}
                    </select>
                  </label>
                  {draft.width && <button type="button" className="btn btn--sm" onClick={() => set({ widths: [{ width: draft.width!, variants: draft.variants || [] }], defaultWidth: draft.width! })}><Plus size={14} /> Sell in more widths</button>}
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="card__head"><div><h2>Photos</h2><div className="card__sub">The first photo is the cover. Uploads go to Firebase Storage.</div></div></div>
            <ImageList productId={id} images={draft.images || []} onChange={images => set({ images })} onError={setError} />
            {colourGroups.map(([colour, imgs]) => (
              <div key={colour} style={{ marginTop: 22 }}>
                <div className="card__sub" style={{ marginBottom: 10, color: 'var(--ink)', fontWeight: 500 }}>{colour} photos</div>
                <ImageList productId={id} images={imgs || []} onError={setError}
                  onChange={next => set({ imagesByColor: { ...draft.imagesByColor, [colour]: next } })} />
              </div>
            ))}
            <label className="field" style={{ marginTop: 18 }}>Sizing guide image
              <input className="input" value={draft.sizingImage ?? ''} onChange={e => set({ sizingImage: e.target.value || undefined })} />
            </label>
          </div>

          <div className="card">
            <div className="card__head"><div><h2>Video</h2>{draft.widths?.length ? <div className="card__sub">Each width can have its own video (under Pricing, in its width). This one shows on widths without one.</div> : null}</div></div>
            <ProductVideo productId={id} video={draft.video} poster={draft.videoPoster} onError={setError} onChange={v => set({ video: v.video ?? undefined, videoPoster: v.videoPoster ?? undefined })} />
          </div>

          <details className="card">
            <summary style={{ cursor: 'pointer', fontWeight: 600 }} onClick={() => setJson(JSON.stringify((({ sort, updatedAt, ...r }) => r)(draft), null, 2))}>
              Advanced: edit raw JSON (bundles, colour photos…)
            </summary>
            <p className="card__sub">Every field the storefront reads. Apply to load it into the form, then Save.</p>
            <textarea className="textarea textarea--code" aria-label="Product JSON" value={json} onChange={e => setJson(e.target.value)} spellCheck={false} />
            <div style={{ marginTop: 10 }}><button type="button" className="btn btn--sm" onClick={applyJson}>Apply JSON</button></div>
          </details>
        </div>

        <aside className="editor__side">
          <div className="card">
            <div className="card__head"><h2>Visibility</h2></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(['Live', 'Coming soon', 'Archived'] as const).map(s => (
                <label key={s} className="check"><input type="radio" name="status" checked={status === s || (s === 'Live' && status === 'Redirect')} onChange={() => setStatus(s)} />
                  <span><b style={{ fontWeight: 500 }}>{s}</b><br /><small style={{ color: 'var(--muted)' }}>
                    {s === 'Live' ? 'On sale and listed in the shop' : s === 'Coming soon' ? 'Teaser only, can’t be bought' : 'Removed from the storefront'}
                  </small></span></label>
              ))}
              <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={!!draft.mto} onChange={e => set({ mto: e.target.checked })} /> Made to order</label>
              <label className="field" style={{ marginTop: 6 }}>Redirect product page to
                <input className="input" value={draft.linkTo ?? ''} placeholder="e.g. titans" onChange={e => set({ linkTo: e.target.value || undefined })} />
              </label>
              {!isNew && <div className="card__sub">Last saved {timeAgo(draft.updatedAt)}</div>}
            </div>
          </div>

          {!isNew && <ProductSales id={routeId!} alsoIds={aliases} />}

          <div className="card">
            <div className="private-note"><Lock size={14} /> Private. Never shown on the storefront.</div>
            <div className="card__head"><h2>Cost and margin</h2></div>
            {perSize && <p className="card__sub" style={{ marginTop: 0 }}>Costs are kept per size in the {draft.set ? 'pieces’ own products' : 'pricing grid'}. Below: the default size.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} hidden={perSize}>
              <label className="field">Factory cost (A$)
                <input className="input" type="number" min="0" step="0.01" value={cost.factoryCostAUD ?? ''}
                  onChange={e => setCostState(c => ({ ...c, factoryCostAUD: e.target.value === '' ? null : Number(e.target.value) }))} />
              </label>
              <label className="field">Quoted for size
                <select className="select" value={cost.representativeSize ?? ''} onChange={e => setCostState(c => ({ ...c, representativeSize: e.target.value || null }))}>
                  <option value="">From-price size</option>
                  {[...new Set([...(cost.representativeSize ? [cost.representativeSize] : []), ...sizeOptions(draft)])].map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="check"><input type="checkbox" checked={!!cost.factoryCostEstimated} onChange={e => setCostState(c => ({ ...c, factoryCostEstimated: e.target.checked }))} /> Cost is an estimate</label>
              <label className="field">Notes<input className="input" value={cost.notes ?? ''} onChange={e => setCostState(c => ({ ...c, notes: e.target.value }))} /></label>
            </div>
            {live ? (
              <dl className="kv" style={{ marginTop: 16 }}>
                <dt>Retail at that size</dt><dd>{aud(live.retailAUD)}</dd>
                <dt>Gross profit</dt><dd>{aud(live.grossProfitAUD)}</dd>
                <dt>Gross margin</dt><dd>{pct(live.grossMarginPct)}</dd>
                <dt>Markup</dt><dd>{live.markup.toFixed(2)}×</dd>
                <dt>Payment fee</dt><dd>{aud(live.paymentFeeAUD, 2)}</dd>
                <dt>Contribution</dt><dd>{aud(live.contributionAUD, 2)} ({pct(live.contributionMarginPct)})</dd>
                <dt>Break-even ROAS</dt><dd>{live.breakEvenRoas ? live.breakEvenRoas.toFixed(2) + '×' : '–'}</dd>
                <dt>Max ad spend / sale</dt><dd>{aud(live.maxAdPerSaleAUD, 2)}</dd>
              </dl>
            ) : <p className="card__sub" style={{ marginTop: 14 }}>Add a factory cost to see margins.</p>}
          </div>

          {!isNew && (
            <div className="card">
              <div className="card__head"><h2>Danger zone</h2></div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {status !== 'Archived'
                  ? <button className="btn btn--danger" onClick={() => setStatus('Archived')}>Archive (then Save)</button>
                  : <button className="btn btn--danger" onClick={destroy}><Trash2 size={15} /> Delete permanently</button>}
              </div>
            </div>
          )}
        </aside>
      </div>
      {toast.node}
    </>
  );
}

/** A width's colours: blank means every colour of the product. Kept as typed until it leaves the box. */
function WidthColours({ value, all, onChange }: { value?: string[]; all: string[]; onChange: (col: string[] | undefined) => void }) {
  const [text, setText] = useState((value || []).join(', '));
  useEffect(() => { setText((value || []).join(', ')); }, [value]);
  const commit = () => {
    const col = text.split(',').map(s => s.trim()).filter(Boolean);
    onChange(col.length ? col : undefined);
  };
  return (
    <label className="field">Colours
      <input className="input" value={text} placeholder={all.length ? all.join(', ') : 'Silver'} onChange={e => setText(e.target.value)} onBlur={commit} />
    </label>
  );
}
