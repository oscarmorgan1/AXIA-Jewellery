import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ArrowUpRight, EyeOff, Save, Timer, Type, Undo2 } from 'lucide-react';
import { db, siteUrl } from '../firebase';
import { DEFAULT_COUNTDOWN, useCountdown } from '../lib/data';
import { useToast } from '../components/Toast';
import type { Countdown } from '../types';

const MODES: { key: Countdown['mode']; label: string; icon: React.ReactNode; hint: string }[] = [
  { key: 'timer', label: 'Countdown', icon: <Timer size={15} />, hint: 'Counts down to the date below, then shows the “after” text.' },
  { key: 'text', label: 'Text', icon: <Type size={15} />, hint: 'Shows your text instead of numbers, e.g. “Dropping soon”.' },
  { key: 'off', label: 'Hidden', icon: <EyeOff size={15} />, hint: 'Removes the countdown from every page.' },
];

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO -> value for <input type="datetime-local"> in the browser's time zone */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function parts(target: number, now: number) {
  const t = Math.max(0, Math.floor((target - now) / 1000));
  return { d: pad(Math.floor(t / 86400)), h: pad(Math.floor((t % 86400) / 3600)), m: pad(Math.floor((t % 3600) / 60)), s: pad(t % 60), done: t === 0 };
}

export default function Website() {
  const { data, loading, error, saved } = useCountdown();
  const [draft, setDraft] = useState<Countdown>(DEFAULT_COUNTDOWN);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => { if (!loading) setDraft(data); }, [data, loading]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const target = new Date(draft.target).getTime();
  const p = parts(target, now);
  const dirty = (['mode', 'label', 'text', 'target', 'endedText'] as const).some(k => draft[k] !== data[k]);
  const set = (patch: Partial<Countdown>) => setDraft(d => ({ ...d, ...patch }));

  async function save() {
    if (draft.mode === 'timer' && Number.isNaN(target)) return toast.show('Pick a date and time for the countdown');
    setSaving(true);
    try {
      await setDoc(doc(db, 'site', 'countdown'), {
        mode: draft.mode, label: draft.label.trim(), text: draft.text.trim(), target: draft.target, endedText: draft.endedText.trim(),
        updatedAt: serverTimestamp(),
      });
      toast.show('Saved. The website shows the new countdown on the next page load.');
    } catch (e) {
      toast.show(`Couldn’t save: ${(e as Error).message}`);
    } finally { setSaving(false); }
  }

  const label = draft.label || DEFAULT_COUNTDOWN.label;
  const showTimer = draft.mode === 'timer' && !Number.isNaN(target) && !p.done;
  const shownText = draft.mode === 'timer' ? (draft.endedText || DEFAULT_COUNTDOWN.endedText) : (draft.text || DEFAULT_COUNTDOWN.text);

  return (
    <>
      <div className="page-head">
        <div><h1>Website</h1><p className="lede" style={{ margin: 0 }}>The launch countdown on the landing page, the Cuban and First Drop pages, and the bar across the shop.</p></div>
        <span className="spacer" />
        <a className="btn" href={siteUrl('index.html')} target="_blank" rel="noreferrer">Open site <ArrowUpRight size={15} /></a>
      </div>

      {error && <div className="notice notice--error">{error.message}</div>}

      <div className="cd-preview" aria-label="Preview">
        <span className="cd-preview__tag">Preview</span>
        {draft.mode === 'off' ? (
          <div className="cd-preview__off"><EyeOff size={18} /> The countdown is hidden on the website</div>
        ) : (
          <>
            <div className="cd-preview__eye">{label}{showTimer ? ' lands in' : ''}</div>
            {showTimer ? (
              <div className="cd-preview__grid">
                {([['d', 'Days'], ['h', 'Hrs'], ['m', 'Min'], ['s', 'Sec']] as const).map(([k, l]) => (
                  <div key={k}><b key={p[k]}>{p[k]}</b><span>{l}</span></div>
                ))}
              </div>
            ) : <div className="cd-preview__text">{shownText}</div>}
          </>
        )}
      </div>

      <div className="card">
        <div className="card__head">
          <div><h2>Countdown</h2><div className="card__sub">{saved ? `Last saved ${data.updatedAt?.toDate().toLocaleString('en-AU') ?? ''}` : 'Not saved yet: the site is showing the built-in “Dropping soon”.'}</div></div>
        </div>

        <div className="field">What it shows
          <div className="segmented" style={{ alignSelf: 'flex-start' }}>
            {MODES.map(m => <button key={m.key} type="button" className={draft.mode === m.key ? 'on' : ''} onClick={() => set({ mode: m.key })}>{m.icon} {m.label}</button>)}
          </div>
          <span className="sub" style={{ fontWeight: 400 }}>{MODES.find(m => m.key === draft.mode)?.hint}</span>
        </div>

        {draft.mode !== 'off' && (
          <div className="form-grid" style={{ marginTop: 16 }}>
            <label className="field">Heading<input className="input" value={draft.label} maxLength={60} placeholder={DEFAULT_COUNTDOWN.label} onChange={e => set({ label: e.target.value })} /></label>
            {draft.mode === 'timer' ? (
              <>
                <label className="field">Launch date and time
                  <input className="input" type="datetime-local" value={toLocalInput(draft.target)} onChange={e => set({ target: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
                  <span className="sub" style={{ fontWeight: 400 }}>{Number.isNaN(target) ? 'Pick a date' : p.done ? 'This date has passed, so the site shows the “after” text.' : `${new Date(target).toLocaleString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}, your time`}</span>
                </label>
                <label className="field full">Text once it hits zero<input className="input" value={draft.endedText} maxLength={60} placeholder={DEFAULT_COUNTDOWN.endedText} onChange={e => set({ endedText: e.target.value })} /></label>
              </>
            ) : (
              <label className="field">Text<input className="input" value={draft.text} maxLength={60} placeholder={DEFAULT_COUNTDOWN.text} onChange={e => set({ text: e.target.value })} /></label>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn--primary" onClick={save} disabled={saving || (!dirty && saved)}><Save size={15} /> {saving ? 'Saving…' : 'Save countdown'}</button>
          {dirty && <button className="btn" onClick={() => setDraft(data)}><Undo2 size={15} /> Undo changes</button>}
        </div>
      </div>
      {toast.node}
    </>
  );
}
