import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Mail, Plus, Radio } from 'lucide-react';
import { adminApi } from '../lib/api';
import { siteUrl } from '../firebase';
import { pct } from '../lib/format';
import { AUDIENCE_LABEL, day, rate, type AudienceSummary, type Campaign, type Template, type Tracking } from '../lib/marketing';
import Drawer from '../components/Drawer';
import StatCard from '../components/StatCard';
import { SkeletonRows } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const STATUS: Record<Campaign['status'], [string, string]> = {
  draft: ['Draft', 'chip--muted'], sending: ['Sending', 'chip--warn'], sent: ['Sent', 'chip--good'],
};

/** Delivery, open and click reports: one click to connect, or the manual steps. */
export function TrackingCard({ tracking, onChange }: { tracking: Tracking; onChange: (t: Tracking) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [manual, setManual] = useState(false);
  const [secret, setSecret] = useState('');

  async function setUp() {
    setBusy(true); setError(''); setNotes([]);
    try {
      const r = await adminApi<Tracking & { notes: string[] }>('/marketing/tracking/setup', {});
      setNotes(r.notes || []); onChange(r);
    } catch (e) { setError((e as Error).message); setManual(true); } finally { setBusy(false); }
  }
  async function saveSecret() {
    setBusy(true); setError('');
    try { onChange(await adminApi<Tracking>('/marketing/tracking/secret', { secret })); setSecret(''); setManual(false); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (tracking.webhook && !manual) {
    return (
      <div className="card mk-tracking mk-tracking--on">
        <CheckCircle2 size={18} />
        <div><b>Results are live.</b> Deliveries, opens, clicks, bounces and spam complaints come in from Resend as they happen.
          {tracking.openTracking === null && <> If opens or clicks stay at 0, turn on open and click tracking for {tracking.domain || 'your domain'} in Resend (Domains, then Configuration).</>}
          {notes.map(n => <div key={n} className="muted" style={{ marginTop: 4 }}>{n}</div>)}
        </div>
      </div>
    );
  }
  return (
    <div className="card mk-tracking">
      <div className="card__head"><div><h2><Radio size={16} /> Connect results</h2>
        <div className="card__sub">Emails send without this, but you’d only see how many went out. Connecting adds a webhook in Resend so deliveries, opens and clicks show up here, and turns on open and click tracking for {tracking.domain || 'your sending domain'}.</div></div>
        <button className="btn btn--primary" onClick={setUp} disabled={busy || !tracking.emailReady}>{busy ? 'Connecting…' : 'Connect Resend'}</button>
      </div>
      {!tracking.emailReady && <div className="notice notice--warn">Email isn’t set up on the server yet (RESEND_API_KEY or ORDER_EMAIL_FROM is missing).</div>}
      {error && <div className="notice notice--error" style={{ marginTop: 12 }}>{error}</div>}
      {notes.map(n => <div key={n} className="notice notice--warn" style={{ marginTop: 12 }}>{n}</div>)}
      {!manual ? <button className="link-btn" style={{ marginTop: 10 }} onClick={() => setManual(true)}>Set it up by hand instead</button> : (
        <ol className="mk-steps">
          <li>In Resend, open <b>Webhooks</b> and add an endpoint: <code className="mono">{tracking.endpoint}</code></li>
          <li>Tick <b>email.delivered</b>, <b>email.opened</b>, <b>email.clicked</b>, <b>email.bounced</b> and <b>email.complained</b>.</li>
          <li>Under <b>Domains</b>, open {tracking.domain || 'your domain'}, then Configuration, and turn on open and click tracking.</li>
          <li>Copy the webhook’s signing secret and paste it here. It stays on the server.
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input className="input" style={{ flex: 1 }} value={secret} placeholder="whsec_…" onChange={e => setSecret(e.target.value.trim())} />
              <button className="btn" onClick={saveSecret} disabled={busy || !secret}>Save</button>
            </div>
          </li>
        </ol>
      )}
    </div>
  );
}

function NewEmail({ onClose }: { onClose: () => void }) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const nav = useNavigate();
  useEffect(() => { adminApi<Template[]>('/marketing/templates').then(setTemplates).catch(e => setError(e.message)); }, []);
  async function pick(id: string) {
    setBusy(id); setError('');
    try { const r = await adminApi<{ id: string }>('/marketing/campaigns', { template: id }); nav(`/marketing/${r.id}`); }
    catch (e) { setError((e as Error).message); setBusy(''); }
  }
  return (
    <Drawer title="New email" onClose={onClose}>
      <div className="card__sub">Pick a starting point. Everything in it can be changed before anything is sent.</div>
      {error && <div className="notice notice--error">{error}</div>}
      <div className="mk-templates">
        {(templates || []).map(t => (
          <button key={t.id} className="mk-template" onClick={() => pick(t.id)} disabled={!!busy}>
            <img src={siteUrl(t.heroImage)} alt="" />
            <span><b>{t.name}</b>{busy === t.id ? 'Setting it up…' : t.blurb}</span>
          </button>
        ))}
      </div>
    </Drawer>
  );
}

export default function Marketing() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [audience, setAudience] = useState<AudienceSummary | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();
  const toast = useToast();

  const load = useCallback(() => {
    adminApi<Campaign[]>('/marketing/campaigns').then(setCampaigns).catch(e => setError(e.message));
    adminApi<Tracking>('/marketing/tracking').then(setTracking).catch(() => {});
    adminApi<AudienceSummary>('/marketing/audience?audience=waitlist').then(setAudience).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const sent = (campaigns || []).filter(c => c.status !== 'draft');
  const tot = sent.reduce((a, c) => ({ sent: a.sent + c.stats.sent, delivered: a.delivered + c.stats.delivered, opened: a.opened + c.stats.opened, clicked: a.clicked + c.stats.clicked }), { sent: 0, delivered: 0, opened: 0, clicked: 0 });
  const base = tot.delivered || tot.sent;

  return (
    <>
      <div className="page-head">
        <h1>Marketing</h1><span className="spacer" />
        <button className="btn btn--primary" onClick={() => setCreating(true)}><Plus size={16} /> New email</button>
        <p className="lede">Email the waitlist in the AXIA style and see who opened and clicked. People who unsubscribed are never emailed.</p>
      </div>
      {error && <div className="notice notice--error">{error}</div>}

      <div className="grid-4">
        <StatCard label="On the list" value={audience ? audience.count : '–'}
          foot={audience ? <>{audience.excluded.unsubscribed} unsubscribed · {audience.excluded.noConsent} didn’t opt in</> : 'Waitlist sign-ups who said yes to email'} />
        <StatCard label="Emails sent" value={tot.sent} foot={`${sent.length} ${sent.length === 1 ? 'send' : 'sends'}`} />
        <StatCard label="Open rate" value={base ? pct((tot.opened / base) * 100) : '–'} foot={`${tot.opened} people opened`} />
        <StatCard label="Click rate" value={base ? pct((tot.clicked / base) * 100) : '–'} foot={`${tot.clicked} people clicked`} />
      </div>

      {tracking && <TrackingCard tracking={tracking} onChange={t => { setTracking(t); toast.show('Results connected'); }} />}

      <div className="card">
        <div className="card__head"><h2>Emails</h2></div>
        {campaigns === null ? <div className="table-wrap"><SkeletonRows rows={3} /></div> : !campaigns.length ? (
          <div className="empty"><Mail size={28} /><b>No emails yet</b>Start with “Drop is live in 48 hours” or “Store is live”.
            <div style={{ marginTop: 14 }}><button className="btn btn--primary" onClick={() => setCreating(true)}><Plus size={16} /> New email</button></div></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Email</th><th>Status</th><th>To</th><th>Date</th><th className="num">Sent</th><th className="num">Delivered</th><th className="num">Opened</th><th className="num">Clicked</th></tr></thead>
              <tbody>{campaigns.map(c => {
                const [label, cls] = STATUS[c.status];
                return (
                  <tr key={c.id} className="clickable" onClick={() => nav(`/marketing/${c.id}`)}>
                    <td><b>{c.name}</b><div className="muted" style={{ fontSize: 12.5 }}>{c.content.subject || 'No subject yet'}</div></td>
                    <td><span className={`chip ${cls}`}>{label}</span></td>
                    <td>{AUDIENCE_LABEL[c.content.audience]}</td>
                    <td>{c.status === 'draft' ? `Edited ${day(c.updatedAt)}` : day(c.sentAt || c.sendStartedAt)}</td>
                    <td className="num">{c.status === 'draft' ? '–' : c.stats.sent}</td>
                    <td className="num">{c.status === 'draft' ? '–' : pct(c.stats.sent ? (c.stats.delivered / c.stats.sent) * 100 : null, 0)}</td>
                    <td className="num">{c.status === 'draft' ? '–' : pct(rate(c.stats.opened, c.stats), 0)}</td>
                    <td className="num">{c.status === 'draft' ? '–' : pct(rate(c.stats.clicked, c.stats), 0)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </div>
      {creating && <NewEmail onClose={() => setCreating(false)} />}
      {toast.node}
    </>
  );
}
