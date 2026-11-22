import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { ArrowUpRight, Copy, Gift, ImagePlus, Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { db, siteUrl, storage } from '../firebase';
import { useGiveaways, useLegacyGiveaway, useProducts } from '../lib/data';
import { firstImage, statusOf } from '../lib/catalogue';
import Drawer from '../components/Drawer';
import { useConfirm } from '../components/Confirm';
import { useToast } from '../components/Toast';
import type { GiveawayItem } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');
function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const when = (iso: string) => new Date(iso).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const rid = () => Math.random().toString(36).slice(2, 8);

/** Same as DEFAULT_GIVEAWAY in server/promotions.js: what the site runs until giveaways are saved here. */
export const BUILT_IN: GiveawayItem = {
  id: 'micro-pave-15mm', on: true, title: 'Win the 15mm Micro Pavé Chain', prize: '15mm Micro Pavé Cuban Chain', valueAUD: 2699,
  image: 'assets/img/products/micro-pave-cuban-chain-15mm/1.jpg',
  description: 'Our 15mm Micro Pavé Cuban chain, fully iced in hand-set VVS moissanite and 925 sterling silver. Sign up free and follow us on Instagram to go in the draw.',
  steps: ['Sign up free below. That’s your entry.', 'Follow AXIA on Instagram.', 'One entry per person. Australian residents 18+.'],
  instagram: '', startsAt: '', endsAt: '2026-12-26T23:59:00+11:00', showCountdown: true,
  endedText: 'Entries are closed. The winner is announced within 7 days.',
  winnerText: 'Winner drawn at random and announced within 7 days of entries closing.',
};
const blank = (): GiveawayItem => ({ ...BUILT_IN, id: '', title: '', prize: '', valueAUD: null, image: '', description: '', endsAt: '', instagram: '' });

type Status = 'Running' | 'Scheduled' | 'Closed' | 'Off' | 'No end date';
function statusOfG(g: GiveawayItem, now: number): Status {
  if (!g.on) return 'Off';
  if (!g.endsAt) return 'No end date';
  if (g.startsAt && Date.parse(g.startsAt) > now) return 'Scheduled';
  return Date.parse(g.endsAt) > now ? 'Running' : 'Closed';
}
const CHIP: Record<Status, string> = { Running: 'chip--good', Scheduled: 'chip--ice', Closed: 'chip--muted', Off: 'chip--muted', 'No end date': 'chip--warn' };

function Editor({ start, onClose, onSave }: { start: GiveawayItem; onClose: () => void; onSave: (g: GiveawayItem) => Promise<void> }) {
  const [g, setG] = useState(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const file = useRef<HTMLInputElement>(null);
  const { data: products } = useProducts();
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const set = (p: Partial<GiveawayItem>) => setG(x => ({ ...x, ...p }));
  const photos = useMemo(() => [...new Set(products.filter(x => statusOf(x) !== 'Archived').map(firstImage).filter(Boolean) as string[])].slice(0, 30), [products]);

  const end = Date.parse(g.endsAt);
  const t = Math.max(0, Math.floor((end - now) / 1000));
  const parts = { d: pad(Math.floor(t / 86400)), h: pad(Math.floor((t % 86400) / 3600)), m: pad(Math.floor((t % 3600) / 60)), s: pad(t % 60) };

  async function upload(f?: File) {
    if (!f) return;
    setUploading(true);
    try {
      const r = ref(storage, `products/_giveaways/${Date.now()}-${f.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`);
      await uploadBytes(r, f, { contentType: f.type, cacheControl: 'public, max-age=31536000' });
      set({ image: await getDownloadURL(r) });
    } catch (e) { setError(`Upload failed: ${(e as Error).message}`); } finally { setUploading(false); if (file.current) file.current.value = ''; }
  }
  async function save() {
    setError('');
    if (!g.title.trim()) return setError('Give the giveaway a title, like “Win the 15mm Micro Pavé Chain”.');
    if (!g.endsAt) return setError('Pick when entries close.');
    if (g.startsAt && Date.parse(g.endsAt) <= Date.parse(g.startsAt)) return setError('Entries have to close after they open.');
    setBusy(true);
    try {
      const id = g.id || `${g.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${rid()}`;
      await onSave({ ...g, id, title: g.title.trim(), steps: g.steps.map(s => s.trim()).filter(Boolean), instagram: g.instagram.replace(/^@/, '').trim() });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Drawer title={start.id ? `Edit ${start.title}` : 'New giveaway'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button><span style={{ flex: 1 }} />
      <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : start.id ? 'Save giveaway' : 'Create giveaway'}</button>
    </>}>
      {error && <div className="notice notice--error">{error}</div>}
      <label className="check"><input type="checkbox" checked={g.on} onChange={e => set({ on: e.target.checked })} /> <span>Giveaway is on<br /><small className="muted">Off takes it off the site straight away.</small></span></label>

      <div className="cd-preview" aria-label="Preview" style={{ marginBottom: 0 }}>
        <span className="cd-preview__tag">Preview</span>
        <div className="cd-preview__eye"><Gift size={12} style={{ verticalAlign: '-1px' }} /> {g.title || 'Your giveaway'}</div>
        {g.showCountdown && end > now ? (
          <div className="cd-preview__grid">
            {([['d', 'Days'], ['h', 'Hrs'], ['m', 'Min'], ['s', 'Sec']] as const).map(([k, l]) => <div key={k}><b key={parts[k]}>{parts[k]}</b><span>{l}</span></div>)}
          </div>
        ) : <div className="cd-preview__text" style={{ fontSize: 'clamp(18px, 4vw, 26px)' }}>{!g.endsAt ? 'Pick when entries close' : end <= now ? g.endedText : 'Countdown hidden'}</div>}
      </div>

      <div className="form-grid">
        <label className="field full">Title<input className="input" value={g.title} maxLength={90} placeholder="Win the 15mm Micro Pavé Chain" onChange={e => set({ title: e.target.value })} /></label>
        <label className="field">Prize<input className="input" value={g.prize} maxLength={90} placeholder="15mm Micro Pavé Cuban Chain" onChange={e => set({ prize: e.target.value })} /></label>
        <label className="field">Prize value (A$, optional)<input className="input" type="number" min={1} value={g.valueAUD ?? ''} onChange={e => set({ valueAUD: e.target.value ? Math.round(Number(e.target.value)) : null })} /></label>
        <label className="field full">Description<textarea className="input" rows={3} maxLength={600} value={g.description} onChange={e => set({ description: e.target.value })} /></label>
      </div>

      <h3 className="drawer__h">How to enter</h3>
      {g.steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 8 }}>
          <input className="input" style={{ flex: 1 }} value={s} maxLength={160} onChange={e => set({ steps: g.steps.map((x, j) => (j === i ? e.target.value : x)) })} />
          <button type="button" className="icon-btn" aria-label="Remove step" onClick={() => set({ steps: g.steps.filter((_, j) => j !== i) })}><X size={15} /></button>
        </div>
      ))}
      {g.steps.length < 6 && <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => set({ steps: [...g.steps, ''] })}><Plus size={15} /> Add a step</button>}
      <label className="field" style={{ maxWidth: 320 }}>Instagram account to follow
        <input className="input" value={g.instagram} maxLength={40} placeholder="axiajewellery" onChange={e => set({ instagram: e.target.value })} />
        <span className="sub" style={{ fontWeight: 400 }}>Shows a Follow button linking to instagram.com/{g.instagram.replace(/^@/, '') || '…'}.</span>
      </label>

      <h3 className="drawer__h">When</h3>
      <div className="form-grid">
        <label className="field">Opens (optional)
          <input className="input" type="datetime-local" value={toLocalInput(g.startsAt)} onChange={e => set({ startsAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
          <span className="sub" style={{ fontWeight: 400 }}>{g.startsAt ? `${when(g.startsAt)}, your time` : 'Shows as soon as you save.'}</span>
        </label>
        <label className="field">Entries close
          <input className="input" type="datetime-local" value={toLocalInput(g.endsAt)} onChange={e => set({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
          <span className="sub" style={{ fontWeight: 400 }}>{g.endsAt ? `${when(g.endsAt)}, your time` : 'Pick a date'}</span>
        </label>
      </div>
      <label className="check"><input type="checkbox" checked={g.showCountdown} onChange={e => set({ showCountdown: e.target.checked })} /> Show the countdown</label>
      <div className="form-grid">
        <label className="field full">Text once entries close<input className="input" value={g.endedText} maxLength={160} onChange={e => set({ endedText: e.target.value })} /></label>
        <label className="field full">How the winner is picked<input className="input" value={g.winnerText} maxLength={200} onChange={e => set({ winnerText: e.target.value })} /></label>
      </div>

      <h3 className="drawer__h">Photo</h3>
      <div className="promo-photos">
        <button type="button" className="promo-photo promo-photo--up" onClick={() => file.current?.click()} disabled={uploading}><ImagePlus size={18} />{uploading ? 'Uploading…' : 'Upload'}</button>
        <input ref={file} type="file" accept="image/*" hidden onChange={e => upload(e.target.files?.[0])} />
        {g.image && !photos.includes(g.image) && <button type="button" className="promo-photo on" style={{ backgroundImage: `url("${siteUrl(g.image)}")` }} aria-label="Current photo" />}
        {photos.map(s => <button key={s} type="button" className={`promo-photo${g.image === s ? ' on' : ''}`} style={{ backgroundImage: `url("${siteUrl(s)}")` }} onClick={() => set({ image: s })} aria-label="Use this photo" />)}
      </div>
      <div className="notice">The giveaway terms on the site cover any giveaway shown on the giveaway page, with its own prize and closing time. Running a game of chance in some states needs a permit above certain prize values; check before a big one.</div>
    </Drawer>
  );
}

/**
 * Giveaways: the prize draws shown on /giveaway with a live countdown (and a strip on the home page).
 * Saved in site/giveaways. Until anything is saved here, the site runs the built-in Micro Pavé giveaway.
 */
export default function Giveaways() {
  const { data: raw, loading, error, saved } = useGiveaways();
  const legacy = useLegacyGiveaway();
  const [editing, setEditing] = useState<GiveawayItem | null>(null);
  const [now, setNow] = useState(Date.now());
  const toast = useToast();
  const confirm = useConfirm();
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  // Nothing saved yet: show what the site is running (the built-in one), so it can be edited.
  const items = useMemo<GiveawayItem[]>(() => saved ? raw.map(g => ({ ...BUILT_IN, ...g, steps: g.steps || [] }))
    : [{ ...BUILT_IN, ...(legacy.data?.endsAt ? { endsAt: legacy.data.endsAt } : {}), ...(legacy.data?.show === false ? { showCountdown: false } : {}) }], [raw, saved, legacy.data]);
  const shown = useMemo(() => {
    const live = items.filter(g => g.on && g.endsAt && !(g.startsAt && Date.parse(g.startsAt) > now));
    const run = live.filter(g => Date.parse(g.endsAt) > now).sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));
    return (run[0] || live.filter(g => now - Date.parse(g.endsAt) < 30 * 86400e3).sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt))[0])?.id;
  }, [items, now]);

  const write = (next: GiveawayItem[]) => setDoc(doc(db, 'site', 'giveaways'), { items: next, updatedAt: serverTimestamp() });
  async function saveOne(g: GiveawayItem) {
    await write(items.some(x => x.id === g.id) ? items.map(x => (x.id === g.id ? g : x)) : [g, ...items]);
    setEditing(null);
    toast.show(`${g.title} saved. The site shows it within a minute.`);
  }
  async function toggle(g: GiveawayItem) {
    try { await write(items.map(x => (x.id === g.id ? { ...x, on: !x.on } : x))); toast.show(g.on ? `${g.title} taken off the site` : `${g.title} switched on`); } catch (e) { toast.show(`Couldn’t save: ${(e as Error).message}`); }
  }
  async function remove(g: GiveawayItem) {
    if (!(await confirm({ title: `Delete ${g.title}?`, body: 'It comes off the giveaway page. Sign-ups already made stay under Customers.', confirmLabel: 'Delete', tone: 'danger', icon: <Trash2 size={18} /> }))) return;
    try { await write(items.filter(x => x.id !== g.id)); toast.show(`${g.title} deleted`); } catch (e) { toast.show(`Couldn’t delete: ${(e as Error).message}`); }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Giveaways</h1><p className="lede" style={{ margin: 0 }}>Prize draws on the giveaway page, with a live countdown there and on the home page. Entering is signing up. The site shows the running giveaway that closes soonest.</p></div>
        <span className="spacer" />
        <a className="btn" href={siteUrl('/giveaway')} target="_blank" rel="noreferrer">Open giveaway page <ArrowUpRight size={15} /></a>
        <button className="btn btn--primary" onClick={() => setEditing(blank())}><Plus size={15} /> New giveaway</button>
      </div>
      {error && <div className="notice notice--error">{error.message}</div>}
      {!saved && !loading && <div className="notice">The site is running the built-in Micro Pavé giveaway below. Edit it to change anything; it saves here from then on.</div>}

      {loading ? <div className="card"><div className="muted">Loading…</div></div> : (
        <div className="promo-list">
          {items.map(g => {
            const st = statusOfG(g, now);
            return (
              <div className="card promo-row" key={g.id}>
                <div className="promo-row__sw" style={g.image ? { backgroundImage: `url("${siteUrl(g.image)}")` } : { background: '#111315' }}>{g.image ? '' : <Gift size={22} />}</div>
                <div className="promo-row__b">
                  <div className="promo-row__t"><b>{g.title}</b><span className={`chip ${CHIP[st]}`}>{st}</span>{shown === g.id && <span className="chip chip--ice">On the site</span>}</div>
                  <div className="sub">{g.prize}{g.valueAUD ? ` · valued at A$${g.valueAUD.toLocaleString('en-AU')}` : ''}{g.instagram ? ` · follow @${g.instagram}` : ''}</div>
                  <div className="sub">{g.endsAt ? `${Date.parse(g.endsAt) > now ? 'Closes' : 'Closed'} ${when(g.endsAt)}` : 'No closing date'}{g.showCountdown ? ' · Countdown' : ''}</div>
                </div>
                <div className="promo-row__a">
                  <button className="btn" onClick={() => toggle(g)}><Power size={15} /> {g.on ? 'Switch off' : 'Switch on'}</button>
                  <button className="icon-btn" onClick={() => setEditing(g)} aria-label={`Edit ${g.title}`}><Pencil size={16} /></button>
                  <button className="icon-btn" onClick={() => setEditing({ ...g, id: '', title: `${g.title} copy`, on: false })} aria-label={`Duplicate ${g.title}`}><Copy size={16} /></button>
                  {saved && <button className="icon-btn" onClick={() => remove(g)} aria-label={`Delete ${g.title}`}><Trash2 size={16} /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing && <Editor start={editing} onClose={() => setEditing(null)} onSave={saveOne} />}
      {toast.node}
    </>
  );
}
