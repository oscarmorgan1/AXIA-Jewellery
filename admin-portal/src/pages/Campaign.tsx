import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Monitor, RefreshCw, Send, ShieldCheck, Smartphone, Trash2, X } from 'lucide-react';
import { adminApi } from '../lib/api';
import { useAuth } from '../auth';
import { siteUrl } from '../firebase';
import { useProducts } from '../lib/data';
import { pct } from '../lib/format';
import {
  AUDIENCE_LABEL, EMAIL_PHOTOS, dayTime, rate,
  type Audience, type AudienceSummary, type Campaign as CampaignT, type CampaignContent, type Recipient, type Tracking,
} from '../lib/marketing';
import StatCard from '../components/StatCard';
import Drawer from '../components/Drawer';
import ConfirmDelete from '../components/ConfirmDelete';
import { SkeletonPage } from '../components/Skeleton';
import { useConfirm } from '../components/Confirm';
import { useToast } from '../components/Toast';
import { TrackingCard } from './Marketing';

type Detail = CampaignT & { recipients: Recipient[] };

/** The email exactly as the server renders it, in a sandboxed frame. */
function Preview({ content }: { content: CampaignContent }) {
  const [html, setHtml] = useState('');
  const [subject, setSubject] = useState('');
  const [width, setWidth] = useState<'desktop' | 'phone'>('desktop');
  const [error, setError] = useState('');
  const key = JSON.stringify(content);
  useEffect(() => {
    const t = setTimeout(() => {
      adminApi<{ html: string; subject: string }>('/marketing/preview', { content })
        .then(r => { setHtml(r.html.replace('<head>', '<head><base target="_blank">')); setSubject(r.subject); setError(''); })
        .catch(e => setError(e.message));
    }, 350);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="card mk-preview">
      <div className="card__head">
        <div style={{ minWidth: 0 }}><h2>Preview</h2><div className="card__sub mk-preview__subject">{subject || 'No subject yet'}{content.preheader ? <span> · {content.preheader}</span> : null}</div></div>
        <span className="spacer" />
        <div className="segmented" role="group" aria-label="Preview width">
          <button className={width === 'desktop' ? 'on' : ''} onClick={() => setWidth('desktop')} aria-label="Desktop"><Monitor size={14} /></button>
          <button className={width === 'phone' ? 'on' : ''} onClick={() => setWidth('phone')} aria-label="Phone"><Smartphone size={14} /></button>
        </div>
      </div>
      {error && <div className="notice notice--error">{error}</div>}
      <div className={`mk-frame mk-frame--${width}`}>
        {html ? <iframe title="Email preview" srcDoc={html} sandbox="allow-popups allow-popups-to-escape-sandbox" /> : <div className="skeleton" style={{ height: 600 }} />}
      </div>
      <div className="card__sub">Shown as Alex would see it. Each person gets their own first name and unsubscribe link.</div>
    </div>
  );
}

function PhotoPicker({ value, onPick }: { value: string; onPick: (src: string, alt: string) => void }) {
  const { data: products } = useProducts();
  const photos = useMemo(() => {
    const seen = new Set<string>();
    const out = [...EMAIL_PHOTOS];
    for (const p of products) {
      if (p.archived) continue;
      const src = p.images?.[0];
      if (src && /\.(jpe?g|png)$/i.test(src) && !seen.has(src)) { seen.add(src); out.push({ src, alt: p.name }); }
    }
    return out;
  }, [products]);
  return (
    <div className="mk-photos">
      <button className={`mk-photo mk-photo--none${!value ? ' on' : ''}`} onClick={() => onPick('', '')}>No photo</button>
      {photos.map(ph => (
        <button key={ph.src} className={`mk-photo${value === ph.src ? ' on' : ''}`} onClick={() => onPick(ph.src, ph.alt)} title={ph.alt}>
          <img src={siteUrl(ph.src)} alt={ph.alt} loading="lazy" />
        </button>
      ))}
    </div>
  );
}

function Editor({ c, setC, audience }: { c: CampaignContent; setC: (p: Partial<CampaignContent>) => void; audience: AudienceSummary | null }) {
  const { data: products } = useProducts();
  const live = products.filter(p => !p.archived);
  const byId = new Map(products.map(p => [p.id, p]));
  return (
    <div className="mk-form">
      <div className="card">
        <div className="card__head"><h2>Who it goes to</h2></div>
        <div className="segmented">
          {(['waitlist', 'everyone'] as Audience[]).map(a => <button key={a} className={c.audience === a ? 'on' : ''} onClick={() => setC({ audience: a })}>{AUDIENCE_LABEL[a]}</button>)}
        </div>
        <div className="mk-audience">
          {audience ? <><b>{audience.count} {audience.count === 1 ? 'person' : 'people'}</b> will get this.</> : 'Counting…'}
          <div className="card__sub">
            {c.audience === 'waitlist' ? 'Waitlist sign-ups who ticked “email me”.' : 'Waitlist sign-ups who ticked “email me”, plus account holders with news and offers on.'}
            {audience && <> Left out: {audience.excluded.unsubscribed} unsubscribed, {audience.excluded.noConsent} who didn’t opt in.</>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__head"><h2>Inbox</h2></div>
        <div className="form-grid">
          <label className="field full">Subject<input className="input" value={c.subject} maxLength={150} onChange={e => setC({ subject: e.target.value })} /></label>
          <label className="field full">Preview text <span className="muted">(the grey line after the subject in most inboxes)</span><input className="input" value={c.preheader} maxLength={200} onChange={e => setC({ preheader: e.target.value })} /></label>
        </div>
      </div>

      <div className="card">
        <div className="card__head"><h2>Top</h2></div>
        <div className="form-grid">
          <label className="field full">Small line above the photo<input className="input" value={c.eyebrow} maxLength={60} onChange={e => setC({ eyebrow: e.target.value })} /></label>
        </div>
        <div className="field" style={{ marginTop: 14 }}>Photo</div>
        <PhotoPicker value={c.heroImage} onPick={(heroImage, heroAlt) => setC({ heroImage, heroAlt })} />
        <label className="check" style={{ marginTop: 16 }}>
          <input type="checkbox" checked={!!c.stat} onChange={e => setC({ stat: e.target.checked ? { value: '48', label: 'Hours to go', note: '' } : null })} /> Big number under the photo (like a countdown)
        </label>
        {c.stat && (
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="field">Number<input className="input" value={c.stat.value} maxLength={12} onChange={e => setC({ stat: { ...c.stat!, value: e.target.value } })} /></label>
            <label className="field">Label<input className="input" value={c.stat.label} maxLength={40} onChange={e => setC({ stat: { ...c.stat!, label: e.target.value } })} /></label>
            <label className="field full">Line under it<input className="input" value={c.stat.note} maxLength={120} placeholder="Thursday 20 November · 7pm Sydney time" onChange={e => setC({ stat: { ...c.stat!, note: e.target.value } })} /></label>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card__head"><h2>Message</h2></div>
        <div className="form-grid">
          <label className="field full">Heading<input className="input" value={c.heading} maxLength={120} onChange={e => setC({ heading: e.target.value })} /></label>
          <label className="field full">Text
            <textarea className="textarea" style={{ minHeight: 200 }} value={c.body} onChange={e => setC({ body: e.target.value })} />
            <span className="muted" style={{ fontWeight: 400 }}>Leave a blank line between paragraphs. <code className="mono">{'{{first_name}}'}</code> becomes their first name (or “there”).</span>
          </label>
          <label className="field">Button<input className="input" value={c.ctaLabel} maxLength={40} placeholder="No button" onChange={e => setC({ ctaLabel: e.target.value })} /></label>
          <label className="field">Button link<input className="input" value={c.ctaUrl} maxLength={500} placeholder="/shop" onChange={e => setC({ ctaUrl: e.target.value })} /></label>
          <label className="field full">Small print under the button<input className="input" value={c.footnote} maxLength={400} onChange={e => setC({ footnote: e.target.value })} /></label>
        </div>
      </div>

      <div className="card">
        <div className="card__head"><div><h2>Pieces</h2><div className="card__sub">Up to 6, shown two to a row with their photo and from price.</div></div></div>
        <div className="form-grid">
          <label className="field full">Title above them<input className="input" value={c.productsTitle} maxLength={60} onChange={e => setC({ productsTitle: e.target.value })} /></label>
        </div>
        <div className="mk-pieces">
          {c.products.map(id => {
            const p = byId.get(id);
            return (
              <div key={id} className="mk-piece">
                {p?.images?.[0] ? <img className="thumb" src={siteUrl(p.images[0])} alt="" /> : <span className="thumb" />}
                <span>{p?.name || id}{p?.archived && <span className="chip chip--warn" style={{ marginLeft: 6 }}>Archived, left out</span>}</span>
                <button className="icon-btn" aria-label={`Remove ${p?.name || id}`} onClick={() => setC({ products: c.products.filter(x => x !== id) })}><X size={15} /></button>
              </div>
            );
          })}
        </div>
        {c.products.length < 6 && (
          <select className="input" value="" onChange={e => e.target.value && setC({ products: [...c.products, e.target.value] })} style={{ marginTop: 10 }}>
            <option value="">Add a piece…</option>
            {live.filter(p => !c.products.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}{p.width ? ` · ${p.width}` : ''}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

/** Sends in steps until done, showing progress. Closing the tab pauses it; Continue sending picks it up. */
function SendProgress({ id, start, expected, onDone }: { id: string; start: boolean; expected: number; onDone: (msg: string, ok: boolean) => void }) {
  const [stats, setStats] = useState({ sent: 0, recipients: expected, skipped: 0 });
  const [error, setError] = useState('');
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return; ran.current = true;
    (async () => {
      try {
        let r = await adminApi<{ done: boolean; busy?: boolean; stats: CampaignT['stats'] }>(`/marketing/campaigns/${id}/send${start ? '' : '/next'}`, start ? { expected } : {});
        setStats(r.stats);
        while (!r.done) {
          if (r.busy) await new Promise(res => setTimeout(res, 3000));
          r = await adminApi(`/marketing/campaigns/${id}/send/next`, {});
          setStats(r.stats);
        }
        onDone(`Sent to ${r.stats.sent} ${r.stats.sent === 1 ? 'person' : 'people'}`, true);
      } catch (e) { setError((e as Error).message); }
    })();
  }, [id, start, expected, onDone]);
  const total = stats.recipients || expected || 1;
  const doneN = stats.sent + stats.skipped;
  return (
    <Drawer title="Sending" onClose={() => onDone(error ? 'Paused. Press Continue sending to carry on.' : 'Still sending while this tab is open', false)}>
      <div className="mk-progress"><div style={{ width: `${Math.min(100, (doneN / total) * 100)}%` }} /></div>
      <p><b>{stats.sent}</b> of {total} sent{stats.skipped ? `, ${stats.skipped} skipped (unsubscribed)` : ''}.</p>
      {error ? <div className="notice notice--error">{error}</div> : <div className="card__sub">Keep this open until it finishes. About 500 emails go every few seconds.</div>}
    </Drawer>
  );
}

const FILTERS = ['All', 'Opened', 'Clicked', 'Not opened', 'Bounced', 'Skipped'] as const;

function Report({ d, tracking, setTracking, reload }: { d: Detail; tracking: Tracking | null; setTracking: (t: Tracking) => void; reload: () => void }) {
  const s = d.stats;
  const [filter, setFilter] = useState<typeof FILTERS[number]>('All');
  const [q, setQ] = useState('');
  const [syncing, setSyncing] = useState(false);
  const toast = useToast();
  const rows = d.recipients.filter(r => {
    if (q && !`${r.email} ${r.firstName}`.toLowerCase().includes(q.toLowerCase())) return false;
    switch (filter) {
      case 'Opened': return !!r.openedAt;
      case 'Clicked': return !!r.clickedAt;
      case 'Not opened': return r.status === 'sent' && !r.openedAt && !r.bouncedAt;
      case 'Bounced': return !!r.bouncedAt;
      case 'Skipped': return r.status === 'skipped' || r.status === 'failed';
      default: return true;
    }
  }).sort((a, b) => (b.clickedAt || b.openedAt || b.sentAt || 0) - (a.clickedAt || a.openedAt || a.sentAt || 0));

  async function sync() {
    setSyncing(true);
    try { const r = await adminApi<{ updated: number }>(`/marketing/campaigns/${d.id}/sync`, {}); toast.show(r.updated ? `${r.updated} updated from Resend` : 'Up to date'); reload(); }
    catch (e) { toast.show((e as Error).message); } finally { setSyncing(false); }
  }

  const bar = (label: string, n: number, of: number) => (
    <div className="mk-funnel__row" key={label}>
      <span>{label}</span>
      <div className="mk-funnel__bar"><div style={{ width: `${of ? Math.max(1.5, (n / of) * 100) : 0}%` }} /></div>
      <span className="num"><b>{n}</b> {of ? pct((n / of) * 100, 0) : ''}</span>
    </div>
  );

  const state = (r: Recipient) => r.status === 'skipped' ? ['Skipped', 'chip--muted'] : r.status === 'failed' ? ['Failed', 'chip--bad'] : r.status === 'queued' ? ['Waiting', 'chip--muted']
    : r.complainedAt ? ['Marked spam', 'chip--bad'] : r.bouncedAt ? ['Bounced', 'chip--bad'] : r.clickedAt ? ['Clicked', 'chip--good'] : r.openedAt ? ['Opened', 'chip--ice']
    : r.deliveredAt ? ['Delivered', 'chip--muted'] : ['Sent', 'chip--muted'];

  return (
    <>
      <div className="grid-4">
        <StatCard label="Sent" value={s.sent} foot={`${s.recipients} on the list${s.skipped ? ` · ${s.skipped} skipped` : ''}`} />
        <StatCard label="Delivered" value={s.sent ? pct((s.delivered / s.sent) * 100, 0) : '–'} foot={<>{s.delivered} delivered{s.bounced ? <> · <b>{s.bounced}</b> bounced</> : ''}</>} />
        <StatCard label="Opened" value={pct(rate(s.opened, s), 0)} foot={<>{s.opened} people · {s.opens} opens</>} />
        <StatCard label="Clicked" value={pct(rate(s.clicked, s), 0)} foot={<>{s.clicked} people · {s.clicks} clicks{s.complained ? <> · <b>{s.complained}</b> spam</> : ''}</>} />
      </div>
      {tracking && !tracking.webhook && <TrackingCard tracking={tracking} onChange={setTracking} />}
      <div className="grid-2">
        <div className="card">
          <div className="card__head"><h2>How it did</h2><span className="spacer" />
            <button className="btn btn--sm" onClick={sync} disabled={syncing} title="Reads the latest state of each email from Resend"><RefreshCw size={13} className={syncing ? 'spin' : ''} /> {syncing ? 'Checking…' : 'Check Resend now'}</button>
          </div>
          <div className="mk-funnel">
            {bar('Sent', s.sent, s.sent)}
            {bar('Delivered', s.delivered, s.sent)}
            {bar('Opened', s.opened, s.sent)}
            {bar('Clicked', s.clicked, s.sent)}
          </div>
          <div className="card__sub">Opens are a guide: Apple Mail opens every email to load images, and some apps block them. Clicks are exact. People who mark it as spam are unsubscribed automatically.</div>
          {d.syncedAt && <div className="card__sub">Last checked with Resend {dayTime(d.syncedAt)}.</div>}
        </div>
        <div className="card">
          <div className="card__head"><h2>Links clicked</h2></div>
          {d.links.length ? (
            <div className="mk-links">{d.links.map(l => (
              <div key={l.url} className="mk-link"><a href={l.url} target="_blank" rel="noreferrer">{l.url.replace(/^https?:\/\/(www\.)?/, '')}</a><b>{l.clicks}</b></div>
            ))}</div>
          ) : <div className="muted">No clicks yet{tracking && !tracking.webhook ? ' (link clicks need results connected)' : ''}.</div>}
        </div>
      </div>
      <div className="card">
        <div className="card__head"><h2>People</h2><span className="spacer" />
          <input className="input" style={{ width: 220 }} placeholder="Search email or name" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="tags" style={{ marginBottom: 14 }}>
          {FILTERS.map(f => <button key={f} className={`tag-toggle${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Person</th><th>Status</th><th>Sent</th><th>Opened</th><th>Clicked</th></tr></thead>
            <tbody>{rows.slice(0, 500).map(r => {
              const [label, cls] = state(r);
              return (
                <tr key={r.email}>
                  <td><Link to={`/customers/${encodeURIComponent(r.email)}`}>{r.email}</Link>{r.firstName && <span className="muted"> · {r.firstName}</span>}</td>
                  <td><span className={`chip ${cls}`} title={r.error || undefined}>{label}</span></td>
                  <td>{dayTime(r.sentAt) || '–'}</td>
                  <td>{r.openedAt ? `${dayTime(r.openedAt)}${r.opens > 1 ? ` · ${r.opens}×` : ''}` : '–'}</td>
                  <td>{r.clickedAt ? `${dayTime(r.clickedAt)}${r.clicks > 1 ? ` · ${r.clicks}×` : ''}` : '–'}</td>
                </tr>
              );
            })}</tbody>
          </table>
          {!rows.length && <div className="empty">Nobody here.</div>}
        </div>
      </div>
      {toast.node}
    </>
  );
}

export default function Campaign() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [c, setContent] = useState<CampaignContent | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [audience, setAudience] = useState<AudienceSummary | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [sending, setSending] = useState<null | { start: boolean; expected: number }>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    adminApi<Detail>(`/marketing/campaigns/${encodeURIComponent(id)}`).then(r => {
      setD(r); setContent(r.content); setName(r.name); setSaved('saved'); setError('');
    }).catch(e => setError(e.message));
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => { adminApi<Tracking>('/marketing/tracking').then(setTracking).catch(() => {}); }, []);
  useEffect(() => { setTestTo(user?.email || ''); }, [user]);

  // Draft: saves itself a moment after each change.
  const draft = d?.status === 'draft';
  const first = useRef(true);
  useEffect(() => {
    if (!c || !draft) return;
    if (first.current) { first.current = false; return; }
    setSaved('dirty');
    const t = setTimeout(() => {
      setSaved('saving');
      adminApi(`/marketing/campaigns/${encodeURIComponent(id)}`, { name, content: c })
        .then(() => setSaved('saved')).catch(e => { setError(e.message); setSaved('dirty'); });
    }, 900);
    return () => clearTimeout(t);
  }, [c, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const aud = c?.audience;
  useEffect(() => {
    if (!aud || !draft) return;
    setAudience(null);
    adminApi<AudienceSummary>(`/marketing/audience?audience=${aud}`).then(setAudience).catch(() => {});
  }, [aud, draft]);

  const setC = (p: Partial<CampaignContent>) => setContent(x => (x ? { ...x, ...p } : x));
  const doneSending = useCallback((msg: string, ok: boolean) => { setSending(null); toast.show(msg); if (ok) load(); else setTimeout(load, 1500); }, [load, toast]);

  if (error && !d) return <div className="notice notice--error">{error}</div>;
  if (!d || !c) return <SkeletonPage />;

  async function sendTest() {
    try {
      await adminApi(`/marketing/campaigns/${encodeURIComponent(id)}/test`, { to: testTo, content: c });
      setTesting(false); toast.show(`Test sent to ${testTo}`); load();
    } catch (e) { toast.show((e as Error).message); }
  }

  async function review() {
    if (saved !== 'saved') await adminApi(`/marketing/campaigns/${encodeURIComponent(id)}`, { name, content: c }).then(() => setSaved('saved'));
    const a = await adminApi<AudienceSummary>(`/marketing/audience?audience=${c!.audience}`);
    setAudience(a);
    if (!c!.subject.trim() || !c!.heading.trim()) { toast.show('Add a subject and a heading first'); return; }
    if (!a.count) { toast.show('Nobody on this list can be emailed yet'); return; }
    const ok = await confirm({
      title: `Send to ${a.count} ${a.count === 1 ? 'person' : 'people'}?`, tone: 'warn', confirmLabel: `Send ${a.count} emails`, word: 'SEND', icon: <Send size={20} />,
      body: <>
        <p><b>{c!.subject}</b><br /><span className="muted">To {AUDIENCE_LABEL[c!.audience]} · from {tracking?.from || 'the AXIA address'}</span></p>
        <p className="mk-compliance"><ShieldCheck size={15} /> {a.excluded.unsubscribed} unsubscribed and {a.excluded.noConsent} who didn’t opt in are left out. Anyone who unsubscribes while it’s sending is skipped. Every email has their own unsubscribe link.</p>
        <p className="muted">This can’t be undone.{d!.tests.length ? '' : ' You haven’t sent yourself a test yet.'}</p>
      </>,
    });
    if (ok) setSending({ start: true, expected: a.count });
  }

  return (
    <>
      <div className="page-head">
        <Link to="/marketing" className="btn btn--ghost btn--sm" style={{ marginBottom: 6 }}><ArrowLeft size={15} /> Marketing</Link>
        <div style={{ width: '100%' }} />
        {draft ? <input className="mk-title" value={name} maxLength={80} onChange={e => setName(e.target.value)} aria-label="Email name (only you see this)" />
          : <h1>{d.name}</h1>}
        <span className={`chip ${draft ? 'chip--muted' : d.status === 'sending' ? 'chip--warn' : 'chip--good'}`}>{draft ? 'Draft' : d.status === 'sending' ? 'Sending' : 'Sent'}</span>
        {draft && <span className="muted" style={{ fontSize: 13 }}>{saved === 'saved' ? 'Saved' : saved === 'saving' ? 'Saving…' : 'Editing'}</span>}
        <span className="spacer" />
        <button className="btn" onClick={async () => { const r = await adminApi<{ id: string }>(`/marketing/campaigns/${encodeURIComponent(id)}/duplicate`, {}); nav(`/marketing/${r.id}`); }}><Copy size={15} /> Duplicate</button>
        {d.status !== 'sending' && <button className="btn" aria-label="Delete" onClick={() => setDeleting(true)}><Trash2 size={15} /></button>}
        {draft && <button className="btn" onClick={() => setTesting(true)}><Send size={15} /> Send a test</button>}
        {draft && <button className="btn btn--primary" onClick={() => review().catch(e => toast.show(e.message))}><Send size={15} /> Review and send</button>}
        {d.status === 'sending' && <button className="btn btn--primary" onClick={() => setSending({ start: false, expected: d.stats.recipients })}><Send size={15} /> Continue sending</button>}
        <p className="lede">{draft ? 'Changes save as you go. Nothing is sent until you press Review and send.'
          : `Sent ${dayTime(d.sentAt || d.sendStartedAt)} by ${d.sentBy || 'an admin'} to ${AUDIENCE_LABEL[c.audience]} · “${c.subject}”`}</p>
      </div>
      {error && <div className="notice notice--error">{error}</div>}
      {d.status === 'sending' && <div className="notice notice--warn">{d.stats.sent} of {d.stats.recipients} sent so far. {d.lastError || 'The send was paused.'} Press Continue sending to finish.</div>}

      {draft ? (
        <div className="mk-editor">
          <Editor c={c} setC={setC} audience={audience} />
          <div className="mk-editor__side"><Preview content={c} /></div>
        </div>
      ) : (
        <>
          <Report d={d} tracking={tracking} setTracking={setTracking} reload={load} />
          <details className="card mk-sent-copy"><summary><h2>The email</h2></summary><Preview content={c} /></details>
        </>
      )}

      {testing && (
        <Drawer title="Send a test" onClose={() => setTesting(false)} footer={<>
          <button className="btn" onClick={() => setTesting(false)}>Cancel</button><span style={{ flex: 1 }} />
          <button className="btn btn--primary" onClick={sendTest} disabled={!testTo}><Send size={15} /> Send test</button>
        </>}>
          <p>Sends one copy, marked <b>[Test]</b>, to this address only. Nobody on the list gets anything.</p>
          <label className="field">Send to<input className="input" type="email" value={testTo} onChange={e => setTestTo(e.target.value)} /></label>
          {d.tests.length > 0 && <div className="card__sub">Earlier tests: {d.tests.slice(-3).map(t => `${t.to} (${dayTime(t.at)})`).join(', ')}</div>}
        </Drawer>
      )}
      {sending && <SendProgress id={encodeURIComponent(id)} start={sending.start} expected={sending.expected} onDone={doneSending} />}
      {deleting && (
        <ConfirmDelete title={`Delete “${d.name}”?`} action="Delete email" onClose={() => setDeleting(false)}
          onConfirm={async () => { await adminApi(`/marketing/campaigns/${encodeURIComponent(id)}/delete`, {}); nav('/marketing'); }}>
          {draft ? <p>This draft goes for good.</p> : <p>The email has already gone out. Deleting it removes its results from here; the emails stay in people’s inboxes.</p>}
        </ConfirmDelete>
      )}
      {toast.node}
    </>
  );
}
