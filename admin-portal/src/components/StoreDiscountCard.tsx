import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Save, Undo2 } from 'lucide-react';
import { db } from '../firebase';
import { DEFAULT_DISCOUNT, useStoreDiscount } from '../lib/data';
import { useToast } from './Toast';
import type { StoreDiscount } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');
function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Same rounding as the server (server/variants.js salePrice) and the storefront. */
const salePrice = (aud: number, pct: number) => Math.round((aud * (100 - pct)) / 100);
const money = (n: number) => 'A$' + n.toLocaleString('en-AU');

/**
 * Website > Store discount: a manual % off every price on the site. The storefront shows the
 * original crossed out next to the sale price, and checkout charges the sale price.
 */
export default function StoreDiscountCard() {
  const { data, loading, error, saved } = useStoreDiscount();
  const [draft, setDraft] = useState<StoreDiscount>(DEFAULT_DISCOUNT);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  useEffect(() => { if (!loading) setDraft(data); }, [data, loading]);
  const set = (patch: Partial<StoreDiscount>) => setDraft(d => ({ ...d, ...patch }));

  const pct = Number(draft.pct);
  const pctOk = pct >= 1 && pct <= 90;
  const ended = !!draft.endsAt && new Date(draft.endsAt).getTime() <= Date.now();
  const running = data.on && Number(data.pct) >= 1 && Number(data.pct) <= 90 && !(data.endsAt && new Date(data.endsAt).getTime() <= Date.now());
  const dirty = (['on', 'pct', 'endsAt', 'allowPromos'] as const).some(k => draft[k] !== data[k]);

  async function save() {
    if (draft.on && !pctOk) return toast.show('Pick a discount between 1% and 90%');
    setSaving(true);
    try {
      await setDoc(doc(db, 'site', 'discount'), {
        on: draft.on, pct: Math.round(pct * 100) / 100, endsAt: draft.endsAt || '', allowPromos: draft.allowPromos,
        updatedAt: serverTimestamp(),
      });
      toast.show(draft.on ? `Saved. ${pct}% off shows on the website within a minute.` : 'Saved. The website is back to full prices within a minute.');
    } catch (e) {
      toast.show(`Couldn’t save: ${(e as Error).message}`);
    } finally { setSaving(false); }
  }

  return (
    <div className="card">
      <div className="card__head">
        <div><h2>Store discount</h2><div className="card__sub">A percentage off every product and set on the site. Listings and product pages show the original price crossed out, and checkout charges the sale price.</div></div>
        <span className="spacer" />
        <span className={`chip ${running ? 'chip--good' : 'chip--muted'}`}>{running ? `${data.pct}% off is live` : 'Off'}</span>
      </div>
      {error && <div className="notice notice--error">{error.message}</div>}

      <label className="check"><input type="checkbox" checked={draft.on} onChange={e => set({ on: e.target.checked })} /> Run a store discount</label>

      {draft.on && (
        <>
          <div className="form-grid" style={{ marginTop: 16 }}>
            <label className="field">Discount (%)
              <input className="input" type="number" min={1} max={90} step={1} value={Number.isNaN(pct) ? '' : draft.pct} onChange={e => set({ pct: e.target.value === '' ? NaN : Number(e.target.value) })} />
              <span className="sub" style={{ fontWeight: 400 }}>{pctOk ? `For example, ${money(199)} becomes ${money(salePrice(199, pct))} and ${money(1299)} becomes ${money(salePrice(1299, pct))}. Prices round to the whole dollar.` : 'Between 1% and 90%.'}</span>
            </label>
            <label className="field">Ends (optional)
              <input className="input" type="datetime-local" value={toLocalInput(draft.endsAt)} onChange={e => set({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
              <span className="sub" style={{ fontWeight: 400 }}>{!draft.endsAt ? 'Runs until you switch it off.' : ended ? 'This time has passed, so the discount is off.' : `Stops on its own ${new Date(draft.endsAt).toLocaleString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}, your time.`}</span>
            </label>
          </div>
          <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={draft.allowPromos} onChange={e => set({ allowPromos: e.target.checked })} />
            <span>Promo codes still work on top<br /><small className="muted">Untick so checkout doesn’t take promo codes while the discount runs.</small></span></label>
          <div className="notice" style={{ marginTop: 12 }}>Australian Consumer Law: a crossed-out price should be one the piece was genuinely on sale at for a reasonable time just before the discount. Running it before the shop has sold at full price risks a misleading “was” price.</div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn btn--primary" onClick={save} disabled={saving || (!dirty && saved)}><Save size={15} /> {saving ? 'Saving…' : 'Save discount'}</button>
        {dirty && <button className="btn" onClick={() => setDraft(data)}><Undo2 size={15} /> Undo changes</button>}
      </div>
      {toast.node}
    </div>
  );
}
