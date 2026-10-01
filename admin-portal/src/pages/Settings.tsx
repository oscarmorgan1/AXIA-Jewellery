import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Lock } from 'lucide-react';
import { db, usingEmulators } from '../firebase';
import { useAuth } from '../auth';
import { useAssumptions } from '../lib/data';
import { useToast } from '../components/Toast';
import type { CostAssumptions } from '../types';

const FIELDS: { key: keyof CostAssumptions; label: string; pct?: boolean; step: string }[] = [
  { key: 'paymentFeePct', label: 'Payment fee (%)', pct: true, step: '0.01' },
  { key: 'paymentFeeFixedAUD', label: 'Payment fee, fixed (A$)', step: '0.01' },
  { key: 'packagingPerUnitAUD', label: 'Packaging per order (A$)', step: '0.01' },
  { key: 'shippingAUD', label: 'Shipping cost to AXIA (A$)', step: '0.01' },
  { key: 'returnsReservePct', label: 'Returns reserve (%)', pct: true, step: '0.1' },
];

export default function Settings() {
  const { user } = useAuth();
  const { data } = useAssumptions();
  const toast = useToast();
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
          <div className="private-note"><Lock size={14} /> Admin only</div>
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
              <dt>Payments</dt><dd>Stripe (not connected yet)</dd>
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
