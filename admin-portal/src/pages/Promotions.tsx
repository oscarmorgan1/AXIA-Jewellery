import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { ArrowUpRight, Copy, ImagePlus, Megaphone, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react';
import { db, siteUrl, storage } from '../firebase';
import { useCollections, useProducts, usePromotions, useStoreDiscount } from '../lib/data';
import { firstImage, statusOf } from '../lib/catalogue';
import { blankPromotion, coveredProducts, newId, salePrice, scopeSummary, statusOfPromo, TEMPLATES, THEMES, themeOf, withDefaults, type PromoStatus } from '../lib/promotions';
import Drawer from '../components/Drawer';
import { useConfirm } from '../components/Confirm';
import { useToast } from '../components/Toast';
import type { Collection, Product, Promotion } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');
function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const when = (iso: string) => new Date(iso).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const money = (n: number) => 'A$' + n.toLocaleString('en-AU');
const CHIP: Record<PromoStatus, string> = { Live: 'chip--good', Scheduled: 'chip--ice', Ended: 'chip--muted', Off: 'chip--muted', 'Needs pieces': 'chip--warn' };

function left(iso: string, now: number) {
  const t = Math.max(0, Math.floor((Date.parse(iso) - now) / 1000));
  return { d: pad(Math.floor(t / 86400)), h: pad(Math.floor((t % 86400) / 3600)), m: pad(Math.floor((t % 3600) / 60)), s: pad(t % 60) };
}

/** The home page banner as the storefront draws it (assets/js/promo.js), at a smaller size. */
export function BannerPreview({ p, now }: { p: Promotion; now: number }) {
  const t = themeOf(p.banner.theme);
  const photo = p.banner.style === 'photo' && p.banner.image;
  const running = p.endsAt && Date.parse(p.endsAt) > now;
  const c = running ? left(p.endsAt, now) : null;
  return (
    <div className="promo-prev" style={photo ? { backgroundImage: `linear-gradient(90deg, rgba(8,10,12,.82), rgba(8,10,12,.35)), url("${siteUrl(p.banner.image)}")`, color: '#F4F1EA' } : { background: t.bg, color: t.fg }}>
      <span className="promo-prev__tag">Preview</span>
      <div className="promo-prev__eye" style={{ color: photo ? '#C7EAF7' : t.accent }}>{p.banner.eyebrow || p.name || 'Promotion'}</div>
      <div className="promo-prev__h">{p.banner.headline || `${p.pct || 0}% off`}</div>
      {p.banner.text && <p className="promo-prev__p">{p.banner.text}</p>}
      {p.banner.showCountdown && c && (
        <div className="promo-prev__cd" aria-label="Countdown">
          <span className="promo-prev__cdl">Ends in</span>
          {([['d', 'd'], ['h', 'h'], ['m', 'm'], ['s', 's']] as const).map(([k, l]) => <span key={k}><b>{c[k]}</b>{l}</span>)}
        </div>
      )}
      {p.banner.ctaLabel && <div><span className="promo-prev__cta" style={photo ? {} : { background: t.fg, color: t.bg }}>{p.banner.ctaLabel}</span></div>}
    </div>
  );
}

function ProductPicker({ products, cols, value, onChange }: { products: Product[]; cols: Collection[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const list = products.filter(p => statusOf(p) !== 'Archived' && statusOf(p) !== 'Merged')
    .filter(p => !q || `${p.name} ${p.id} ${(p.coll || []).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  return (
    <div className="promo-pick">
      <div className="search" style={{ marginBottom: 8 }}><Search size={15} /><input placeholder="Search pieces" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="promo-pick__list">
        {list.map(p => (
          <label key={p.id} className={`promo-pick__row${value.includes(p.id) ? ' on' : ''}`}>
            <input type="checkbox" checked={value.includes(p.id)} onChange={() => toggle(p.id)} />
            {firstImage(p) ? <img src={siteUrl(firstImage(p)!)} alt="" loading="lazy" /> : <span className="promo-pick__ph" />}
            <span className="promo-pick__n">{p.name}<small>{statusOf(p) === 'Live' ? money(p.fromPriceAUD || 0) : statusOf(p)}{p.coll?.length ? ` · ${p.coll.map(s => cols.find(c => c.slug === s)?.tab || s).join(', ')}` : ''}</small></span>
          </label>
        ))}
        {!list.length && <div className="muted" style={{ padding: 12 }}>No pieces match.</div>}
      </div>
      <div className="sub" style={{ marginTop: 6 }}>{value.length} picked{value.length ? <> · <button type="button" className="linkish" onClick={() => onChange([])}>Clear</button></> : null}</div>
    </div>
  );
}

function PromoEditor({ start, products, cols, onClose, onSave }: {
  start: Promotion; products: Product[]; cols: Collection[]; onClose: () => void; onSave: (p: Promotion) => Promise<void>;
}) {
  const [p, setP] = useState<Promotion>(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const set = (patch: Partial<Promotion>) => setP(x => ({ ...x, ...patch }));
  const setB = (patch: Partial<Promotion['banner']>) => setP(x => ({ ...x, banner: { ...x.banner, ...patch } }));

  const covered = useMemo(() => coveredProducts(p, products), [p, products]);
  const pctOk = p.pct >= 1 && p.pct <= 90;
  const photos = useMemo(() => [...new Set(products.filter(x => statusOf(x) === 'Live').map(firstImage).filter(Boolean) as string[])].slice(0, 24), [products]);
  const imgSrc = (s: string) => siteUrl(s);

  async function upload(f?: File) {
    if (!f) return;
    setUploading(true);
    try {
      const r = ref(storage, `products/_promotions/${Date.now()}-${f.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`);
      await uploadBytes(r, f, { contentType: f.type, cacheControl: 'public, max-age=31536000' });
      setB({ image: await getDownloadURL(r), style: 'photo' });
    } catch (e) { setError(`Upload failed: ${(e as Error).message}`); } finally { setUploading(false); if (file.current) file.current.value = ''; }
  }

  async function save() {
    setError('');
    if (!p.name.trim()) return setError('Give the promotion a name.');
    if (!pctOk) return setError('Pick a discount between 1% and 90%.');
    if (p.scope === 'products' && !p.productIds.length) return setError('Pick at least one piece, or choose Every piece.');
    if (p.scope === 'collections' && !p.collections.length) return setError('Pick at least one collection, or choose Every piece.');
    if (p.startsAt && p.endsAt && Date.parse(p.endsAt) <= Date.parse(p.startsAt)) return setError('The end has to be after the start.');
    if (p.banner.style === 'photo' && !p.banner.image) return setError('Pick or upload a photo for the banner, or use a colour theme.');
    setBusy(true);
    try { await onSave({ ...p, name: p.name.trim(), id: p.id || newId(p.name) }); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const sample = covered.slice(0, 4);
  return (
    <Drawer title={start.id ? `Edit ${start.name}` : 'New promotion'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button><span style={{ flex: 1 }} />
      <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : start.id ? 'Save promotion' : 'Create promotion'}</button>
    </>}>
      {error && <div className="notice notice--error">{error}</div>}

      <label className="check"><input type="checkbox" checked={p.on} onChange={e => set({ on: e.target.checked })} /> <span>Promotion is on<br /><small className="muted">Off keeps it saved without touching any price.</small></span></label>

      <div className="form-grid">
        <label className="field">Name (for you)<input className="input" value={p.name} maxLength={80} placeholder="Valentine’s Day" onChange={e => set({ name: e.target.value })} /></label>
        <label className="field">Discount (% off)
          <input className="input" type="number" min={1} max={90} value={Number.isNaN(p.pct) ? '' : p.pct} onChange={e => set({ pct: e.target.value === '' ? NaN : Number(e.target.value) })} />
          <span className="sub" style={{ fontWeight: 400 }}>{pctOk ? `${money(199)} shows as ${money(salePrice(199, p.pct))}, ${money(1299)} as ${money(salePrice(1299, p.pct))}.` : 'Between 1% and 90%.'}</span>
        </label>
      </div>

      <h3 className="drawer__h">Which pieces</h3>
      <div className="segmented" style={{ alignSelf: 'flex-start' }}>
        {([['all', 'Every piece'], ['collections', 'Collections'], ['products', 'Pick pieces']] as const).map(([k, l]) => (
          <button key={k} type="button" className={p.scope === k ? 'on' : ''} onClick={() => set({ scope: k })}>{l}</button>
        ))}
      </div>
      {p.scope === 'collections' && (
        <div className="promo-cols">
          {cols.map(c => (
            <label key={c.slug} className="check"><input type="checkbox" checked={p.collections.includes(c.slug)} onChange={e => set({ collections: e.target.checked ? [...p.collections, c.slug] : p.collections.filter(s => s !== c.slug) })} /> {c.name}</label>
          ))}
          {!cols.length && <div className="muted">No collections yet. Make them under Collections.</div>}
        </div>
      )}
      {p.scope === 'products' && <ProductPicker products={products} cols={cols} value={p.productIds} onChange={ids => set({ productIds: ids })} />}
      <label className="field" style={{ marginTop: 12, maxWidth: 260 }}>Only pieces priced up to (optional)
        <input className="input" type="number" min={1} placeholder="Any price" value={p.maxPriceAUD ?? ''} onChange={e => set({ maxPriceAUD: e.target.value ? Math.round(Number(e.target.value)) : null })} />
        <span className="sub" style={{ fontWeight: 400 }}>For “everything under A$300”. Checked against each size’s full price.</span>
      </label>
      <div className="notice" style={{ marginTop: 12 }}>
        <b>{covered.length} live {covered.length === 1 ? 'piece' : 'pieces'}</b> get this discount.
        {sample.length > 0 && <div className="promo-sample">{sample.map(x => <span key={x.id}>{x.name}: <s>{money(x.fromPriceAUD || 0)}</s> {money(salePrice(x.fromPriceAUD || 0, p.pct || 0))}</span>)}</div>}
        <div className="sub" style={{ marginTop: 6 }}>Your prices aren’t changed. The sale price is worked out from the current price, so if you change a price, its sale price follows.</div>
      </div>

      <h3 className="drawer__h">When</h3>
      <div className="form-grid">
        <label className="field">Starts (optional)
          <input className="input" type="datetime-local" value={toLocalInput(p.startsAt)} onChange={e => set({ startsAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
          <span className="sub" style={{ fontWeight: 400 }}>{p.startsAt ? `${when(p.startsAt)}, your time` : 'Starts as soon as you save.'}</span>
        </label>
        <label className="field">Ends
          <input className="input" type="datetime-local" value={toLocalInput(p.endsAt)} onChange={e => set({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
          <span className="sub" style={{ fontWeight: 400 }}>{!p.endsAt ? 'Runs until you switch it off. Set an end for a countdown.' : Date.parse(p.endsAt) <= now ? 'This has passed, so the promotion is over.' : `Prices go back on their own ${when(p.endsAt)}, your time.`}</span>
        </label>
      </div>
      <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={p.allowPromos} onChange={e => set({ allowPromos: e.target.checked })} />
        <span>Promo codes still work on top<br /><small className="muted">Untick so codes like FREE15 can’t be added to sale pieces at checkout.</small></span></label>

      <h3 className="drawer__h">Banner</h3>
      <label className="check"><input type="checkbox" checked={p.banner.show} onChange={e => setB({ show: e.target.checked })} /> <span>Show a banner on the home page</span></label>
      <label className="check"><input type="checkbox" checked={p.banner.strip} onChange={e => setB({ strip: e.target.checked })} /> <span>Show a slim bar on the shop pages<br /><small className="muted">Shop, collections and product pages, under the menu.</small></span></label>
      {(p.banner.show || p.banner.strip) && (
        <>
          <BannerPreview p={p} now={now} />
          <div className="segmented" style={{ alignSelf: 'flex-start' }}>
            <button type="button" className={p.banner.style === 'theme' ? 'on' : ''} onClick={() => setB({ style: 'theme' })}>Colour theme</button>
            <button type="button" className={p.banner.style === 'photo' ? 'on' : ''} onClick={() => setB({ style: 'photo' })}>Photo</button>
          </div>
          {p.banner.style === 'theme' ? (
            <div className="promo-themes">
              {THEMES.map(t => (
                <button key={t.key} type="button" className={`promo-theme${p.banner.theme === t.key ? ' on' : ''}`} onClick={() => setB({ theme: t.key })} aria-pressed={p.banner.theme === t.key}>
                  <span style={{ background: t.bg, color: t.accent }}>Aa</span>{t.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="promo-photos">
              <button type="button" className="promo-photo promo-photo--up" onClick={() => file.current?.click()} disabled={uploading}><ImagePlus size={18} />{uploading ? 'Uploading…' : 'Upload'}</button>
              <input ref={file} type="file" accept="image/*" hidden onChange={e => upload(e.target.files?.[0])} />
              {p.banner.image && !photos.includes(p.banner.image) && <button type="button" className="promo-photo on" style={{ backgroundImage: `url("${imgSrc(p.banner.image)}")` }} aria-label="Uploaded photo" />}
              {photos.map(s => <button key={s} type="button" className={`promo-photo${p.banner.image === s ? ' on' : ''}`} style={{ backgroundImage: `url("${imgSrc(s)}")` }} onClick={() => setB({ image: s })} aria-label="Use this photo" />)}
            </div>
          )}
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="field">Small heading<input className="input" value={p.banner.eyebrow} maxLength={60} placeholder={p.name || 'Storewide sale'} onChange={e => setB({ eyebrow: e.target.value })} /></label>
            <label className="field">Headline<input className="input" value={p.banner.headline} maxLength={90} placeholder={`${p.pct || 0}% off`} onChange={e => setB({ headline: e.target.value })} /></label>
            <label className="field full">Text (optional)<textarea className="input" rows={2} maxLength={240} value={p.banner.text} onChange={e => setB({ text: e.target.value })} /></label>
            <label className="field">Button text (optional)<input className="input" value={p.banner.ctaLabel} maxLength={40} placeholder="Shop the sale" onChange={e => setB({ ctaLabel: e.target.value })} /></label>
            <label className="field">Button goes to<input className="input" value={p.banner.ctaHref} maxLength={300} placeholder="collection" onChange={e => setB({ ctaHref: e.target.value })} />
              <span className="sub" style={{ fontWeight: 400 }}>A page like <code>collection</code> or <code>collection?c=tennis</code>.</span></label>
          </div>
          <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={p.banner.showCountdown} onChange={e => setB({ showCountdown: e.target.checked })} />
            <span>Show the countdown<br /><small className="muted">{p.endsAt ? 'Counts down to the end date.' : 'Needs an end date.'}</small></span></label>
        </>
      )}
      <div className="notice" style={{ marginTop: 16 }}>Australian Consumer Law: a crossed-out price should be one the piece genuinely sold at for a reasonable time just before the promotion.</div>
    </Drawer>
  );
}

/**
 * Promotions: sales that take a % off every piece, some collections or picked pieces, with a
 * banner and countdown on the home page. Saved in site/promotions; the server applies the same
 * prices at checkout (server/promotions.js), and nothing in products/ is changed.
 */
export default function Promotions() {
  const { data: raw, loading, error } = usePromotions();
  const { data: products } = useProducts();
  const { data: cols } = useCollections();
  const legacy = useStoreDiscount();
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [picking, setPicking] = useState(false);
  const [now, setNow] = useState(Date.now());
  const toast = useToast();
  const confirm = useConfirm();
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const items = useMemo(() => raw.map(withDefaults), [raw]);
  const legacyOn = legacy.data.on && legacy.data.pct >= 1 && !(legacy.data.endsAt && Date.parse(legacy.data.endsAt) <= now);

  async function write(next: Promotion[]) {
    await setDoc(doc(db, 'site', 'promotions'), { items: next, updatedAt: serverTimestamp() });
  }
  async function saveOne(p: Promotion) {
    const exists = items.some(x => x.id === p.id);
    await write(exists ? items.map(x => (x.id === p.id ? p : x)) : [p, ...items]);
    setEditing(null);
    toast.show(`${p.name} saved. The website shows it within a minute.`);
  }
  async function toggle(p: Promotion) {
    try { await write(items.map(x => (x.id === p.id ? { ...x, on: !x.on } : x))); toast.show(p.on ? `${p.name} switched off. Full prices are back within a minute.` : `${p.name} switched on.`); }
    catch (e) { toast.show(`Couldn’t save: ${(e as Error).message}`); }
  }
  async function remove(p: Promotion) {
    if (!(await confirm({ title: `Delete ${p.name}?`, body: 'Prices go back to normal for anything it covered. Orders already placed keep what they paid.', confirmLabel: 'Delete', tone: 'danger', icon: <Trash2 size={18} /> }))) return;
    try { await write(items.filter(x => x.id !== p.id)); toast.show(`${p.name} deleted`); } catch (e) { toast.show(`Couldn’t delete: ${(e as Error).message}`); }
  }
  async function moveLegacy() {
    const d = legacy.data;
    const p: Promotion = { ...blankPromotion(), id: newId('store-discount'), name: 'Store discount', pct: d.pct, endsAt: d.endsAt || '', allowPromos: d.allowPromos,
      banner: { ...blankPromotion().banner, show: false, strip: false, eyebrow: 'Store discount', headline: `${d.pct}% off everything` } };
    try {
      await write([p, ...items]);
      await setDoc(doc(db, 'site', 'discount'), { on: false, pct: d.pct, endsAt: d.endsAt || '', allowPromos: d.allowPromos, updatedAt: serverTimestamp() });
      toast.show('Moved into Promotions. Prices on the site don’t change.');
      setEditing(p);
    } catch (e) { toast.show(`Couldn’t move it: ${(e as Error).message}`); }
  }

  const live = items.filter(p => statusOfPromo(p, now) === 'Live');

  return (
    <>
      <div className="page-head">
        <div><h1>Promotions</h1><p className="lede" style={{ margin: 0 }}>Sales that take a percentage off every piece, some collections or pieces you pick, with a banner and countdown on the home page. Your prices aren’t changed: the site and checkout work the sale price out from them.</p></div>
        <span className="spacer" />
        <a className="btn" href={siteUrl('/')} target="_blank" rel="noreferrer">Open site <ArrowUpRight size={15} /></a>
        <button className="btn btn--primary" onClick={() => setPicking(true)}><Plus size={15} /> New promotion</button>
      </div>

      {error && <div className="notice notice--error">{error.message}</div>}

      {legacyOn && (
        <div className="notice notice--warn" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 220 }}>The older store discount ({legacy.data.pct}% off everything) is still running from Website. Move it in here to give it a banner and countdown.</span>
          <button className="btn" onClick={moveLegacy}>Move into Promotions</button>
        </div>
      )}

      {live.length > 1 && <div className="notice">{live.length} promotions are live. Where two cover the same piece, the bigger discount is used. They never add together.</div>}

      {loading ? <div className="card"><div className="muted">Loading…</div></div> : !items.length ? (
        <div className="card empty">
          <Megaphone size={28} />
          <h2>No promotions yet</h2>
          <p className="muted">Start from a template like a storewide sale or Valentine’s Day, then change anything.</p>
          <button className="btn btn--primary" onClick={() => setPicking(true)}><Plus size={15} /> New promotion</button>
        </div>
      ) : (
        <div className="promo-list">
          {items.map(p => {
            const st = statusOfPromo(p, now);
            const t = themeOf(p.banner.theme);
            const n = coveredProducts(p, products).length;
            return (
              <div className="card promo-row" key={p.id}>
                <div className="promo-row__sw" style={p.banner.style === 'photo' && p.banner.image ? { backgroundImage: `url("${siteUrl(p.banner.image)}")` } : { background: t.bg, color: t.accent }}>{p.pct}%</div>
                <div className="promo-row__b">
                  <div className="promo-row__t"><b>{p.name}</b><span className={`chip ${CHIP[st]}`}>{st}</span></div>
                  <div className="sub">{p.pct}% off · {scopeSummary(p, cols, products)} · {n} live {n === 1 ? 'piece' : 'pieces'}</div>
                  <div className="sub">{p.startsAt && Date.parse(p.startsAt) > now ? `Starts ${when(p.startsAt)} · ` : ''}{p.endsAt ? (Date.parse(p.endsAt) > now ? `Ends ${when(p.endsAt)}` : `Ended ${when(p.endsAt)}`) : 'No end date'}{p.banner.show ? ' · Home page banner' : ''}{p.banner.strip ? ' · Shop bar' : ''}{p.banner.showCountdown && p.endsAt ? ' · Countdown' : ''}</div>
                </div>
                <div className="promo-row__a">
                  <button className="btn" onClick={() => toggle(p)} title={p.on ? 'Switch off' : 'Switch on'}><Power size={15} /> {p.on ? 'Switch off' : 'Switch on'}</button>
                  <button className="icon-btn" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}><Pencil size={16} /></button>
                  <button className="icon-btn" onClick={() => setEditing({ ...p, id: '', name: `${p.name} copy`, on: false })} aria-label={`Duplicate ${p.name}`}><Copy size={16} /></button>
                  <button className="icon-btn" onClick={() => remove(p)} aria-label={`Delete ${p.name}`}><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {picking && (
        <Drawer title="New promotion" onClose={() => setPicking(false)}>
          <div className="promo-tpls">
            {TEMPLATES.map(t => (
              <button key={t.key} className="promo-tpl" onClick={() => { setPicking(false); setEditing(t.make()); }}>
                <b>{t.label}</b><span>{t.hint}</span>
              </button>
            ))}
          </div>
        </Drawer>
      )}
      {editing && <PromoEditor start={editing} products={products} cols={cols} onClose={() => setEditing(null)} onSave={saveOne} />}
      {toast.node}
    </>
  );
}
