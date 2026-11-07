import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Construction, Rocket } from 'lucide-react';
import { db, usingEmulators } from '../firebase';
import { useAuth } from '../auth';
import { useAssumptions, useMaintenance } from '../lib/data';
import { useToast } from '../components/Toast';
import { LARP_LEVELS, useLarpMode } from '../lib/larp';
import type { CostAssumptions } from '../types';

const FIELDS: { key: keyof CostAssumptions; label: string; pct?: boolean; step: string }[] = [
  { key: 'paymentFeePct', label: 'Payment fee (%)', pct: true, step: '0.01' },
  { key: 'paymentFeeFixedAUD', label: 'Payment fee, fixed (A$)', step: '0.01' },
  { key: 'packagingPerUnitAUD', label: 'Packaging per order (A$)', step: '0.01' },
  { key: 'shippingAUD', label: 'Shipping cost to AXIA (A$)', step: '0.01' },
  { key: 'returnsReservePct', label: 'Returns reserve (%)', pct: true, step: '0.1' },
];

/**
 * Maintenance / Production switch. Maintenance puts every storefront page behind
 * the "AXIA is unavailable" page and stops checkout (server/static.js, server/checkout.js).
 * The portal keeps working either way.
 */
function SiteModeCard() {
  const { data, loading, error } = useMaintenance();
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function setOn(on: boolean) {
    if (on === data.on) return;
    if (on && !window.confirm('Put the site into maintenance? Visitors will see "AXIA is unavailable" and nobody can check out until you switch back to production.')) return;
    setBusy(true);
    try {
      await setDoc(doc(db, 'site', 'maintenance'), { on, updatedAt: serverTimestamp() });
      toast.show(on ? 'Maintenance on. Visitors see “AXIA is unavailable” within a few seconds.' : 'Back in production. The site is live again within a few seconds.');
    } catch (e) {
      toast.show(`Couldn’t save: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="card__head">
        <div>
          <h2>Site mode</h2>
          <div className="card__sub">
            {data.on
              ? 'Maintenance: every page of the site shows “AXIA is unavailable” and checkout is off. This portal still works.'
              : 'Production: the site is live as normal.'}
            {data.updatedAt ? ` Changed ${data.updatedAt.toDate().toLocaleString('en-AU')}.` : ''}
          </div>
        </div>
        <span className="spacer" />
        {!loading && <span className={`chip ${data.on ? 'chip--warn' : 'chip--good'}`}>{data.on ? 'Maintenance' : 'Production'}</span>}
      </div>
      {error && <div className="notice notice--error">{error.message}</div>}
      <div className="segmented" role="radiogroup" aria-label="Site mode">
        <button type="button" role="radio" aria-checked={!data.on} className={!data.on ? 'on' : ''} disabled={busy || loading} onClick={() => setOn(false)}><Rocket size={15} /> Production</button>
        <button type="button" role="radio" aria-checked={data.on} className={data.on ? 'on' : ''} disabled={busy || loading} onClick={() => setOn(true)}><Construction size={15} /> Maintenance</button>
      </div>
      {toast.node}
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { data } = useAssumptions();
  const toast = useToast();
  const larp = useLarpMode();
  const [form, setForm] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<{ units?: Record<string, number>; total_units?: number; note?: string } | null>(null);

  useEffect(() => {
    setForm(Object.fromEntries(FIELDS.map(f => [f.key, String(+(f.pct ? data[f.key] * 100 : data[f.key]).toFixed(4))])));
  }, [data]);
  useEffect(() => { getDoc(doc(db, 'internal', 'firstDropPlan')).then(s => setPlan(s.data() ?? null)).catch(() => setPlan(null)); }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    const out: Record<string, number> = {};
    for (const f of FIELDS) {
      const n = Number(form[f.key]);
      if (Number.isNaN(n) || n < 0) return toast.show(`Check "${f.label}"`);
      out[f.key] = f.pct ? n / 100 : n;
    }
    try { await setDoc(doc(db, 'internal', 'costAssumptions'), { ...out, updatedAt: serverTimestamp() }, { merge: true }); }
    catch (e) { return toast.show(`Couldn’t save: ${(e as Error).message}`); }
    toast.show('Cost assumptions saved');
  }

  return (
    <>
      <div className="page-head"><h1>Settings</h1></div>
      <div className="grid-2">
        <form className="card" onSubmit={save}>
          <div className="card__head"><div><h2>Cost assumptions</h2><div className="card__sub">Used to work out contribution, break-even ROAS and max ad spend.</div></div></div>
          <div className="form-grid">
            {FIELDS.map(f => (
              <label key={f.key} className="field">{f.label}
                <input className="input" type="number" step={f.step} min="0" value={form[f.key] ?? ''} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))} />
              </label>
            ))}
          </div>
          <div style={{ marginTop: 18 }}><button className="btn btn--primary">Save assumptions</button></div>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <SiteModeCard />
          <div className="card">
            <div className="card__head">
              <h2>Larp mode</h2>
              <button type="button" className="switch" role="switch" aria-checked={larp.on} aria-label="Larp mode"
                onClick={() => { larp.set(larp.on ? 0 : 2); toast.show(larp.on ? 'Larp mode off. Back to reality.' : 'Larp mode on: Millionaire'); }} />
            </div>
            <div className="card__sub" style={{ margin: 0 }}>
              Makes the dashboard show made-up numbers. Pick how rich you want to look. Only on this browser, only on the dashboard. Real data and the public site are never touched.
            </div>
            <div className="larp-levels" role="radiogroup" aria-label="Larp level">
              {LARP_LEVELS.map((l, i) => (
                <button key={l.id} type="button" role="radio" aria-checked={larp.level === l.id}
                  className={`larp-level${larp.level === l.id ? ' on' : ''}`}
                  onClick={() => { larp.set(l.id); toast.show(`Larp mode: ${l.name}`); }}>
                  <span className="larp-level__name"><b>{i + 1}</b>{l.name}</span>
                  <small>{l.blurb}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card__head"><h2>Environment</h2></div>
            <dl className="kv">
              <dt>Signed in as</dt><dd>{user?.email}</dd>
              <dt>Firebase project</dt><dd>axia-jewellery</dd>
              <dt>Data</dt><dd>{usingEmulators ? 'Local emulators' : 'Live'}</dd>
              <dt>Payments</dt><dd>Stripe Checkout</dd>
              <dt>Order emails</dt><dd>Resend</dd>
            </dl>
          </div>
          {plan?.units && (
            <div className="card">
              <div className="card__head"><div><h2>First drop plan</h2><div className="card__sub">{plan.note}</div></div></div>
              <dl className="kv">
                {Object.entries(plan.units).map(([id, n]) => <Fragment key={id}><dt>{id}</dt><dd>{n}</dd></Fragment>)}
                <dt><b>Total units</b></dt><dd>{plan.total_units}</dd>
              </dl>
            </div>
          )}
        </div>
      </div>
      {toast.node}
    </>
  );
}
