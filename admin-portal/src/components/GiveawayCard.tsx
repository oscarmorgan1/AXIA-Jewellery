import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Gift, Save, Undo2 } from 'lucide-react';
import { db } from '../firebase';
import { DEFAULT_GIVEAWAY, useGiveaway } from '../lib/data';
import { useToast } from './Toast';
import type { Giveaway } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');
function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Website > Giveaway: when the AXIA Giveaway closes (site/giveaway). The storefront counts down
 * to it on the giveaway (First Drop) page and the home page, then shows the "closed" text.
 */
export default function GiveawayCard() {
  const { data, loading, error, saved } = useGiveaway();
  const [draft, setDraft] = useState<Giveaway>(DEFAULT_GIVEAWAY);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  useEffect(() => { if (!loading) setDraft(data); }, [data, loading]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const set = (patch: Partial<Giveaway>) => setDraft(d => ({ ...d, ...patch }));

  const end = Date.parse(draft.endsAt);
  const t = Math.max(0, Math.floor((end - now) / 1000));
  const parts = { d: pad(Math.floor(t / 86400)), h: pad(Math.floor((t % 86400) / 3600)), m: pad(Math.floor((t % 3600) / 60)), s: pad(t % 60) };
  const running = !Number.isNaN(end) && t > 0;
  const dirty = (['endsAt', 'show', 'label', 'endedText'] as const).some(k => draft[k] !== data[k]);

  async function save() {
    if (draft.show && Number.isNaN(end)) return toast.show('Pick the date and time the giveaway ends');
    setSaving(true);
    try {
      await setDoc(doc(db, 'site', 'giveaway'), { endsAt: draft.endsAt, show: draft.show, label: draft.label.trim(), endedText: draft.endedText.trim(), updatedAt: serverTimestamp() });
      toast.show('Saved. The giveaway countdown updates on the site within a minute.');
    } catch (e) { toast.show(`Couldn’t save: ${(e as Error).message}`); } finally { setSaving(false); }
  }

  return (
    <div className="card">
      <div className="card__head">
        <div><h2>Giveaway</h2><div className="card__sub">When the AXIA Giveaway closes. The site counts down to it on the giveaway page and the home page.</div></div>
        <span className="spacer" />
        <span className={`chip ${!draft.show || Number.isNaN(end) ? 'chip--muted' : running ? 'chip--good' : 'chip--muted'}`}>{!saved ? 'Not set' : !data.show ? 'Hidden' : running ? 'Counting down' : 'Closed'}</span>
      </div>
      {error && <div className="notice notice--error">{error.message}</div>}

      {draft.show && (
        <div className="cd-preview" aria-label="Preview" style={{ marginBottom: 16 }}>
          <span className="cd-preview__tag">Preview</span>
          <div className="cd-preview__eye"><Gift size={12} style={{ verticalAlign: '-1px' }} /> {draft.label || DEFAULT_GIVEAWAY.label}{running ? ' ends in' : ''}</div>
          {running ? (
            <div className="cd-preview__grid">
              {([['d', 'Days'], ['h', 'Hrs'], ['m', 'Min'], ['s', 'Sec']] as const).map(([k, l]) => <div key={k}><b key={parts[k]}>{parts[k]}</b><span>{l}</span></div>)}
            </div>
          ) : <div className="cd-preview__text" style={{ fontSize: 'clamp(20px, 4vw, 30px)' }}>{Number.isNaN(end) ? 'Pick an end date' : draft.endedText || DEFAULT_GIVEAWAY.endedText}</div>}
        </div>
      )}

      <label className="check"><input type="checkbox" checked={draft.show} onChange={e => set({ show: e.target.checked })} /> Show the giveaway countdown</label>
      <div className="form-grid" style={{ marginTop: 16 }}>
        <label className="field">Giveaway ends
          <input className="input" type="datetime-local" value={toLocalInput(draft.endsAt)} onChange={e => set({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
          <span className="sub" style={{ fontWeight: 400 }}>{Number.isNaN(end) ? 'Pick a date' : `${new Date(end).toLocaleString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}, your time`}</span>
        </label>
        <label className="field">Heading<input className="input" value={draft.label} maxLength={60} placeholder={DEFAULT_GIVEAWAY.label} onChange={e => set({ label: e.target.value })} /></label>
        <label className="field full">Text once it closes<input className="input" value={draft.endedText} maxLength={80} placeholder={DEFAULT_GIVEAWAY.endedText} onChange={e => set({ endedText: e.target.value })} /></label>
      </div>
      <div className="sub" style={{ marginTop: 8 }}>The giveaway terms say a winner is drawn within 7 days of entries closing, so this date is the one entrants hold you to.</div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn btn--primary" onClick={save} disabled={saving || (!dirty && saved)}><Save size={15} /> {saving ? 'Saving…' : 'Save giveaway'}</button>
        {dirty && <button className="btn" onClick={() => setDraft(data)}><Undo2 size={15} /> Undo changes</button>}
      </div>
      {toast.node}
    </div>
  );
}
