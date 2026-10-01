import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Lock, Plus, Trash2 } from 'lucide-react';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, siteUrl } from '../firebase';
import { useAssumptions, useProducts } from '../lib/data';
import { allPrices, slugify, statusOf, withDerivedPrices } from '../lib/catalogue';
import { economics, retailAtSize } from '../lib/economics';
import { aud, pct, timeAgo } from '../lib/format';
import ImageList from '../components/ImageList';
import VariantsTable from '../components/VariantsTable';
import { useToast } from '../components/Toast';
import type { Product, ProductCost, WidthOption } from '../types';

const COLLECTIONS = ['cuban', 'tennis', 'titans', 'pendants'];
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
  const { data: products } = useProducts();
  const { data: assumptions } = useAssumptions();

  const [draft, setDraft] = useState<Product | null>(isNew ? { ...BLANK } : null);
  const [cost, setCost] = useState<Partial<ProductCost>>({});
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Load once (not live) so in-progress edits aren't overwritten by snapshots.
  useEffect(() => {
    if (isNew) { setDraft({ ...BLANK }); setCost({}); return; }
    let off = false;
    (async () => {
      const [ps, cs] = await Promise.all([getDoc(doc(db, 'products', routeId!)), getDoc(doc(db, 'productCosts', routeId!))]);
      if (off) return;
      if (!ps.exists()) { setNotFound(true); return; }
      setDraft({ ...(ps.data() as Product), id: ps.id });
      setCost((cs.data() as ProductCost) || {});
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

  if (notFound) return <div className="card empty"><b>Product not found</b><Link className="btn" to="/products">Back to products</Link></div>;
  if (!draft) return <div className="card empty">Loading…</div>;

  const setStatus = (s: 'Live' | 'Coming soon' | 'Archived') =>
    set({ hidden: s === 'Coming soon', archived: s === 'Archived' });

  const setWidth = (i: number, patch: Partial<WidthOption>) =>
    set({ widths: (draft.widths || []).map((w, k) => (k === i ? { ...w, ...patch } : w)) });

  async function save() {
    setError(null);
    const p = withDerivedPrices({ ...draft!, id });
    if (!p.name.trim()) return setError('Name is required.');
    if (!id) return setError('Name must contain letters or numbers.');
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
      const hasCost = cost.factoryCostAUD != null || cost.representativeSize || cost.notes;
      if (hasCost) {
        b.set(doc(db, 'productCosts', id), {
          ...clean({
            id, name: p.name,
            representativeSize: cost.representativeSize ?? null,
            factoryCostAUD: cost.factoryCostAUD ?? null,
            factoryCostEstimated: !!cost.factoryCostEstimated,
            notes: cost.notes || '',
          }),
          updatedAt: serverTimestamp(),
        }, { merge: true });
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
    if (!confirm(`Permanently delete "${draft!.name}"? This removes it and its cost record. Archiving is reversible; this isn't.`)) return;
    const b = writeBatch(db);
    b.delete(doc(db, 'products', id));
    b.delete(doc(db, 'productCosts', id));
    await b.commit();
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

  const productUrl = draft.linkTo ? siteUrl(draft.linkTo) : siteUrl(`product.html?id=${encodeURIComponent(id)}`);
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
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', paddingTop: 4 }}>
                  {COLLECTIONS.map(c => (
                    <label key={c} className="check"><input type="checkbox" checked={(draft.coll || []).includes(c)}
                      onChange={e => set({ coll: e.target.checked ? [...(draft.coll || []), c] : (draft.coll || []).filter(x => x !== c) })} />
                      {c[0].toUpperCase() + c.slice(1)}</label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <div><h2>Pricing</h2><div className="card__sub">From-price is worked out from the cheapest size when you save.</div></div>
              <span className="spacer" />
              <label className="field" style={{ width: 170 }}>Compare-at (A$)
                <input className="input" type="number" min="0" value={draft.compareAtAUD ?? ''} onChange={e => set({ compareAtAUD: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </label>
            </div>
            {draft.widths?.length ? (
              <>
                {draft.widths.map((w, i) => (
                  <div className="width-block" key={i}>
                    <div className="form-grid" style={{ marginBottom: 10 }}>
                      <label className="field">Width<input className="input" value={w.width} onChange={e => setWidth(i, { width: e.target.value })} /></label>
                      <label className="field">Photo path / URL<input className="input" value={w.image ?? ''} onChange={e => setWidth(i, { image: e.target.value || undefined })} /></label>
                    </div>
                    <VariantsTable variants={w.variants || []} onChange={v => setWidth(i, { variants: v })} />
                    <button type="button" className="btn btn--sm btn--danger" style={{ marginTop: 8 }} onClick={() => set({ widths: draft.widths!.filter((_, k) => k !== i) })}><Trash2 size={14} /> Remove width</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
                  <button type="button" className="btn btn--sm" onClick={() => set({ widths: [...draft.widths!, { width: '', variants: [{ length: '', priceAUD: 0 }] }] })}><Plus size={14} /> Add width</button>
                  <label className="field" style={{ width: 160 }}>Default width
                    <select className="select" value={draft.defaultWidth ?? ''} onChange={e => set({ defaultWidth: e.target.value || undefined })}>
                      <option value="">First</option>{draft.widths.map(w => <option key={w.width}>{w.width}</option>)}
                    </select>
                  </label>
                </div>
              </>
            ) : (
              <>
                <VariantsTable variants={draft.variants || []} onChange={v => set({ variants: v })} />
                <label className="field" style={{ width: 200, marginTop: 12 }}>Default length
                  <select className="select" value={draft.defaultLength ?? ''} onChange={e => set({ defaultLength: e.target.value || undefined })}>
                    <option value="">First</option>{(draft.variants || []).filter(v => v.length).map(v => <option key={v.length!}>{v.length}</option>)}
                  </select>
                </label>
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

          <details className="card">
            <summary style={{ cursor: 'pointer', fontWeight: 600 }} onClick={() => setJson(JSON.stringify((({ sort, updatedAt, ...r }) => r)(draft), null, 2))}>
              Advanced: edit raw JSON (bundles, video, colour photos…)
            </summary>
            <p className="card__sub">Every field the storefront reads. Apply to load it into the form, then Save.</p>
            <textarea className="textarea textarea--code" value={json} onChange={e => setJson(e.target.value)} spellCheck={false} />
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
                <input className="input" value={draft.linkTo ?? ''} placeholder="e.g. titans.html" onChange={e => set({ linkTo: e.target.value || undefined })} />
              </label>
              {!isNew && <div className="card__sub">Last saved {timeAgo(draft.updatedAt)}</div>}
            </div>
          </div>

          <div className="card">
            <div className="private-note"><Lock size={14} /> Private. Never shown on the storefront.</div>
            <div className="card__head"><h2>Cost and margin</h2></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label className="field">Factory cost (A$)
                <input className="input" type="number" min="0" step="0.01" value={cost.factoryCostAUD ?? ''}
                  onChange={e => setCost(c => ({ ...c, factoryCostAUD: e.target.value === '' ? null : Number(e.target.value) }))} />
              </label>
              <label className="field">Quoted for size
                <select className="select" value={cost.representativeSize ?? ''} onChange={e => setCost(c => ({ ...c, representativeSize: e.target.value || null }))}>
                  <option value="">From-price size</option>
                  {[...new Set([...(cost.representativeSize ? [cost.representativeSize] : []), ...sizeOptions(draft)])].map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="check"><input type="checkbox" checked={!!cost.factoryCostEstimated} onChange={e => setCost(c => ({ ...c, factoryCostEstimated: e.target.checked }))} /> Cost is an estimate</label>
              <label className="field">Notes<input className="input" value={cost.notes ?? ''} onChange={e => setCost(c => ({ ...c, notes: e.target.value }))} /></label>
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
