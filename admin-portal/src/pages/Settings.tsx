import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Construction, Lock, PowerOff, Rocket, ShoppingBag } from 'lucide-react';
import { db, usingEmulators } from '../firebase';
import { useAuth } from '../auth';
import { useAssumptions, useMaintenance, useShop } from '../lib/data';
import { useToast } from '../components/Toast';
import { useConfirm, type ConfirmOptions } from '../components/Confirm';
import { LARP_LEVELS, useLarpMode } from '../lib/larp';
import type { CostAssumptions, MaintenanceSettings } from '../types';

const FIELDS: { key: keyof CostAssumptions; label: string; pct?: boolean; step: string }[] = [
  { key: 'paymentFeePct', label: 'Payment fee (%)', pct: true, step: '0.01' },
  { key: 'paymentFeeFixedAUD', label: 'Payment fee, fixed (A$)', step: '0.01' },
  { key: 'packagingPerUnitAUD', label: 'Packaging per order (A$)', step: '0.01' },
  { key: 'shippingAUD', label: 'Shipping cost to AXIA (A$)', step: '0.01' },
  { key: 'returnsReservePct', label: 'Returns reserve (%)', pct: true, step: '0.1' },
];

type SiteMode = MaintenanceSettings['mode'];
const SITE_MODES: { key: SiteMode; label: string; icon: React.ReactNode; chip: string; sub: string; confirm?: ConfirmOptions; toast: string }[] = [
  { key: 'production', label: 'Production', icon: <Rocket size={15} />, chip: 'chip--good',
    sub: 'Production: the site is live as normal.',
    toast: 'Back in production. The site is live again within a few seconds.' },
  { key: 'maintenance', label: 'Maintenance', icon: <Construction size={15} />, chip: 'chip--warn',
    sub: 'Maintenance: every page of the site shows “AXIA is unavailable, back shortly” and checkout is off. This portal still works.',
    confirm: { title: 'Put the site into maintenance?', tone: 'warn', icon: <Construction size={20} />, word: 'MAINTENANCE', confirmLabel: 'Turn on maintenance',
      body: 'Every page of the site will show “AXIA is unavailable, back shortly” and nobody can check out until you switch back to production. This portal keeps working.' },
    toast: 'Maintenance on. Visitors see “AXIA is unavailable” within a few seconds.' },
  { key: 'offline', label: 'Offline', icon: <PowerOff size={15} />, chip: 'chip--bad',
    sub: 'Offline: every page of the site just says “AXIA is offline”, with no promise of coming back soon. Checkout is off. This portal still works.',
    confirm: { title: 'Take the site offline?', tone: 'danger', icon: <PowerOff size={20} />, word: 'OFFLINE', confirmLabel: 'Take site offline',
      body: 'Visitors will only see “AXIA is offline”, with no promise of coming back, and nobody can check out until you switch back to production. This portal keeps working.' },
    toast: 'Site offline. Visitors see “AXIA is offline” within a few seconds.' },
];

/**
 * Production / Maintenance / Offline switch (site/maintenance). Maintenance and Offline put every
 * storefront page behind maintenance.html or offline.html and stop checkout
 * (server/static.js, server/checkout.js). The portal keeps working in every mode.
 */
function SiteModeCard() {
  const { data, loading, error } = useMaintenance();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const current = SITE_MODES.find(m => m.key === data.mode) ?? SITE_MODES[0];

  async function setMode(mode: SiteMode) {
    if (mode === data.mode) return;
    const next = SITE_MODES.find(m => m.key === mode)!;
    if (next.confirm && !(await confirm(next.confirm))) return;
    setBusy(true);
    try {
      // `on` kept for anything still reading the first version of this switch
      await setDoc(doc(db, 'site', 'maintenance'), { mode, on: mode === 'maintenance', updatedAt: serverTimestamp() });
      toast.show(next.toast);
    } catch (e) {
      toast.show(`Couldn’t save: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="card__head">
        <h2>Site mode</h2>
        <span className="spacer" />
        {!loading && <span className={`chip ${current.chip}`}>{current.label}</span>}
      </div>
      <p className="card__lede">
        {current.sub}
        {data.updatedAt ? ` Changed ${data.updatedAt.toDate().toLocaleString('en-AU')}.` : ''}
      </p>
      {error && <div className="notice notice--error">{error.message}</div>}
      <div className="segmented" role="radiogroup" aria-label="Site mode">
        {SITE_MODES.map(m => (
          <button key={m.key} type="button" role="radio" aria-checked={data.mode === m.key} className={data.mode === m.key ? 'on' : ''}
            disabled={busy || loading} onClick={() => setMode(m.key)}>{m.icon} {m.label}</button>
        ))}
      </div>
      {toast.node}
    </div>
  );
}

/** The Open shop switch. While closed, the bag still works but checkout is refused (the server checks too). */
function ShopCard() {
  const { data, loading, error } = useShop();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  async function setOpen(open: boolean) {
    const ok = await confirm(open
      ? { title: 'Open the shop?', tone: 'primary', icon: <ShoppingBag size={20} />, word: 'OPEN', confirmLabel: 'Open shop',
          body: 'The main address will show the store, “Add to bag” and checkout will work, and customers can pay through Stripe straight away.' }
      : { title: 'Close the shop?', tone: 'warn', icon: <Lock size={20} />, word: 'CLOSE', confirmLabel: 'Close shop',
          body: 'The main address goes back to the waitlist page and checkout is switched off. Bags are kept, and the store stays at /store.' });
    if (!ok) return;
    setBusy(true);
    try {
      await setDoc(doc(db, 'site', 'shop'), { open, updatedAt: serverTimestamp() });
      toast.show(open ? 'The shop is open. Checkout works on the next page load.' : 'The shop is closed. Bags are kept, checkout is off.');
    } catch (e) {
      toast.show(`Couldn’t save: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="card__head">
        <h2>Shop</h2>
        <span className="spacer" />
        {!loading && <span className={`chip ${data.open ? 'chip--good' : 'chip--warn'}`}>{data.open ? 'Open' : 'Closed'}</span>}
      </div>
      <p className="card__lede">
        {data.open
          ? 'Open: the main address shows the store, “Add to bag” and checkout work, and payments go through Stripe.'
          : 'Closed: the main address shows the waitlist page (the store is still at /store), buttons say “Reserve your spot” and checkout is switched off.'}
        {data.updatedAt ? ` Changed ${data.updatedAt.toDate().toLocaleString('en-AU')}.` : ''}
      </p>
      {error && <div className="notice notice--error">{error.message}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        {data.open
          ? <button className="btn" onClick={() => setOpen(false)} disabled={busy || loading}><Lock size={15} /> {busy ? 'Closing…' : 'Close shop'}</button>
          : <button className="btn btn--primary" onClick={() => setOpen(true)} disabled={busy || loading}><ShoppingBag size={15} /> {busy ? 'Opening…' : 'Open shop'}</button>}
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
          <SiteModeCard />
          <ShopCard />
          <div className="card">
            <div className="card__head">
              <h2>Larp mode</h2>
              <button type="button" className="switch" role="switch" aria-checked={larp.on} aria-label="Larp mode"
                onClick={() => { larp.set(larp.on ? 0 : 2); toast.show(larp.on ? 'Larp mode off. Back to reality.' : 'Larp mode on: Millionaire'); }} />
            </div>
            <p className="card__lede">
              Makes the dashboard show made-up numbers. Pick how rich you want to look. Only on this browser, only on the dashboard. Real data and the public site are never touched.
            </p>
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
