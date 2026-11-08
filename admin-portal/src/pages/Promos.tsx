import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, TicketPercent, Trash2 } from 'lucide-react';
import { useOrders } from '../lib/data';
import { adminApi } from '../lib/api';
import { aud } from '../lib/format';
import { isSale, orderNo } from '../lib/orders';
import Drawer from '../components/Drawer';
import ConfirmDelete from '../components/ConfirmDelete';
import StatCard from '../components/StatCard';
import { useToast } from '../components/Toast';
import type { Order, PromoCode } from '../types';
import { useConfirm } from '../components/Confirm';

/** The code the sign-up welcome email gives out (server WELCOME_CODE). */
const WELCOME_CODE = 'FREE15';

interface Usage { orders: Order[]; salesAUD: number; discountAUD: number }
const blankUsage = (): Usage => ({ orders: [], salesAUD: 0, discountAUD: 0 });
const day = (ms: number | null) => ms ? new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const dateInput = (ms: number | null) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** New code, or editing one (`promo`). */
function PromoForm({ promo, used, onClose, onSaved }: { promo?: PromoCode; used?: number; onClose: () => void; onSaved: (msg: string) => void }) {
  const [f, setF] = useState(promo ? {
    code: promo.code, percentOff: String(promo.percentOff), kind: promo.kind, affiliateName: promo.affiliate?.name || '', affiliateEmail: promo.affiliate?.email || '',
    maxRedemptions: promo.maxRedemptions ? String(promo.maxRedemptions) : '', expiresAt: dateInput(promo.expiresAt),
  } : { code: '', percentOff: '15', kind: 'affiliate' as 'affiliate' | 'standard', affiliateName: '', affiliateEmail: '', maxRedemptions: '', expiresAt: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (p: Partial<typeof f>) => setF(x => ({ ...x, ...p }));

  // Stripe can't change these on an existing code, so changing one makes a new Stripe code.
  const replaces = !!promo && (f.code !== promo.code || Number(f.percentOff) !== promo.percentOff
    || (f.maxRedemptions ? Number(f.maxRedemptions) : null) !== (promo.maxRedemptions || null) || f.expiresAt !== dateInput(promo.expiresAt));

  async function save() {
    setBusy(true); setError('');
    const body = {
      code: f.code, percentOff: Number(f.percentOff), kind: f.kind,
      affiliateName: f.affiliateName, affiliateEmail: f.affiliateEmail,
      maxRedemptions: f.maxRedemptions ? Number(f.maxRedemptions) : null,
      // Unchanged end date: send the stored time back exactly, so it doesn't count as a change.
      expiresAt: !f.expiresAt ? null : promo && f.expiresAt === dateInput(promo.expiresAt) ? new Date(promo.expiresAt!).toISOString() : new Date(`${f.expiresAt}T23:59:59`).toISOString(),
    };
    try {
      if (promo) {
        const r = await adminApi<{ changed: boolean }>(`/promos/${encodeURIComponent(promo.id)}/edit`, body);
        onSaved(r.changed ? `${f.code.toUpperCase()} saved` : 'Nothing changed');
      } else {
        await adminApi('/promos', body);
        onSaved(`${f.code.toUpperCase()} created in Stripe`);
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Drawer title={promo ? `Edit ${promo.code}` : 'New promo code'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button><span style={{ flex: 1 }} />
      <button className="btn btn--primary" onClick={save} disabled={busy || !f.code}>{busy ? 'Saving in Stripe…' : promo ? 'Save changes' : 'Create code'}</button>
    </>}>
      {error && <div className="notice notice--error">{error}</div>}
      <div className="segmented">
        <button className={f.kind === 'affiliate' ? 'on' : ''} onClick={() => set({ kind: 'affiliate' })}>Affiliate</button>
        <button className={f.kind === 'standard' ? 'on' : ''} onClick={() => set({ kind: 'standard' })}>Standard promo</button>
      </div>
      <div className="card__sub" style={{ marginTop: -6 }}>
        {f.kind === 'affiliate' ? 'For a creator or partner. Their sales are tallied under their name.' : 'A general code, e.g. for a launch or newsletter.'}
      </div>
      <div className="form-grid">
        <label className="field">Code<input className="input" value={f.code} placeholder="JESS15" onChange={e => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} /></label>
        <label className="field">Discount (% off)<input className="input" type="number" min={1} max={100} value={f.percentOff} onChange={e => set({ percentOff: e.target.value })} /></label>
        {f.kind === 'affiliate' && <>
          <label className="field">Affiliate name<input className="input" value={f.affiliateName} placeholder="Jess Smith" onChange={e => set({ affiliateName: e.target.value })} /></label>
          <label className="field">Affiliate email (optional)<input className="input" type="email" value={f.affiliateEmail} onChange={e => set({ affiliateEmail: e.target.value })} /></label>
        </>}
        <label className="field">Max uses (optional)<input className="input" type="number" min={1} value={f.maxRedemptions} placeholder="Unlimited" onChange={e => set({ maxRedemptions: e.target.value })} /></label>
        <label className="field">Ends on (optional)<input className="input" type="date" value={f.expiresAt} onChange={e => set({ expiresAt: e.target.value })} /></label>
      </div>
      {promo ? (
        replaces ? (
          <div className="notice notice--warn">
            Stripe can’t change a code’s text, discount, use limit or end date, so saving switches the old Stripe code off and makes a new one straight away.
            Its {used ? `${used} ${used === 1 ? 'order stays' : 'orders stay'}` : 'past orders stay'} counted here{f.maxRedemptions ? ', and earlier uses still count towards the max uses' : ''}.
          </div>
        ) : <div className="card__sub">Name and affiliate details change in place. The code keeps working at checkout the whole time.</div>
      ) : <div className="card__sub">The code is created in Stripe, so customers enter it on the Stripe checkout page. The discount comes off the items, not shipping. One use per checkout.</div>}
    </Drawer>
  );
}

export default function Promos() {
  const [promos, setPromos] = useState<PromoCode[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PromoCode | null>(null);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const { data: orders } = useOrders();
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(() => {
    adminApi<PromoCode[]>('/promos').then(p => { setPromos(p); setError(''); }).catch(e => setError(e.message));
  }, []);
  useEffect(load, [load]);

  // Every Stripe code and text a promo has had (editing can replace them) → its record.
  const lookup = useMemo(() => {
    const byId = new Map<string, string>(), byCode = new Map<string, string>();
    for (const p of promos || []) {
      for (const sid of [p.id, p.stripe.promotionCodeId, ...(p.stripe.previousPromotionCodeIds || [])]) byId.set(sid, p.id);
      for (const c of [...(p.previousCodes || []), p.code]) byCode.set(c, p.id);
    }
    return { byId, byCode };
  }, [promos]);

  // Sales per code, matched by Stripe promotion code id (or the code text for older orders).
  const usage = useMemo(() => {
    const m = new Map<string, Usage>();
    const { byId, byCode } = lookup;
    for (const o of orders) {
      if (!isSale(o)) continue;
      const id = (o.promotionCodeId && byId.get(o.promotionCodeId)) || (o.promotionCode && byCode.get(o.promotionCode.toUpperCase())) || '';
      if (!id) continue;
      const u = m.get(id) || blankUsage();
      u.orders.push(o); u.salesAUD += o.totalAUD || 0; u.discountAUD += o.discountAUD || 0;
      m.set(id, u);
    }
    return m;
  }, [orders, lookup]);

  // Any order at all with the code, paid or not: those codes can't be deleted.
  const onOrders = useMemo(() => {
    const m = new Map<string, number>();
    const { byId, byCode } = lookup;
    for (const o of orders) {
      const id = (o.promotionCodeId && byId.get(o.promotionCodeId)) || (o.promotionCode && byCode.get(o.promotionCode.toUpperCase())) || '';
      if (id) m.set(id, (m.get(id) || 0) + 1);
    }
    return m;
  }, [orders, lookup]);

  const affiliates = useMemo(() => {
    const m = new Map<string, Usage & { codes: string[] }>();
    for (const p of promos || []) {
      if (p.kind !== 'affiliate' || !p.affiliate) continue;
      const u = usage.get(p.id) || blankUsage();
      const a = m.get(p.affiliate.name) || { ...blankUsage(), codes: [] };
      a.codes.push(p.code); a.orders.push(...u.orders); a.salesAUD += u.salesAUD; a.discountAUD += u.discountAUD;
      m.set(p.affiliate.name, a);
    }
    return [...m.entries()].sort((x, y) => y[1].salesAUD - x[1].salesAUD);
  }, [promos, usage]);

  const totals = useMemo(() => {
    let n = 0, sales = 0, disc = 0;
    for (const u of usage.values()) { n += u.orders.length; sales += u.salesAUD; disc += u.discountAUD; }
    return { n, sales, disc };
  }, [usage]);

  async function toggle(p: PromoCode) {
    if (p.active && !(await confirm({ title: `Turn off ${p.code}?`, tone: 'warn', confirmLabel: 'Turn off code', body: 'Customers won’t be able to use it until you turn it back on.' }))) return;
    try {
      await adminApi(`/promos/${encodeURIComponent(p.id)}/active`, { active: !p.active });
      toast.show(`${p.code} is ${p.active ? 'off' : 'on'}`);
      load();
    } catch (e) { toast.show((e as Error).message); }
  }

  const status = (p: PromoCode) => !p.active ? ['Off', 'chip--muted'] : p.expiresAt && p.expiresAt < Date.now() ? ['Expired', 'chip--bad']
    : p.maxRedemptions && (usage.get(p.id)?.orders.length || 0) >= p.maxRedemptions ? ['Used up', 'chip--warn'] : ['Active', 'chip--good'];

  return (
    <>
      <div className="page-head">
        <h1>Promo codes</h1><span className="spacer" />
        <button className="btn btn--primary" onClick={() => setCreating(true)}><Plus size={16} /> New code</button>
        <p className="lede">Codes live in Stripe and work at checkout. Sales are counted from paid orders that used each code.</p>
      </div>
      {promos && !promos.some(p => p.code === WELCOME_CODE && p.active) && (
        <div className="notice notice--warn" style={{ marginBottom: 20 }}>
          The welcome email gives everyone who signs up the code <b>{WELCOME_CODE}</b>, but it isn’t active here yet. Create it with <b>New code</b> (Standard, 15% off) so it works at checkout.
        </div>
      )}
      {error && <div className="notice notice--error">{error}</div>}

      <div className="grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Active codes" value={(promos || []).filter(p => status(p)[0] === 'Active').length} />
        <StatCard label="Orders with a code" value={totals.n} />
        <StatCard label="Sales from codes" value={aud(totals.sales)} />
        <StatCard label="Discount given" value={aud(totals.disc)} />
      </div>

      {affiliates.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card__head"><div><h2>Affiliates</h2><div className="card__sub">What each affiliate’s codes have brought in.</div></div></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Affiliate</th><th>Codes</th><th className="num">Orders</th><th className="num">Sales</th><th className="num">Discount given</th></tr></thead>
              <tbody>{affiliates.map(([name, a]) => (
                <tr key={name}><td>{name}</td><td>{a.codes.join(', ')}</td><td className="num">{a.orders.length}</td><td className="num">{aud(a.salesAUD, 2)}</td><td className="num">{aud(a.discountAUD, 2)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card__head"><h2>All codes</h2></div>
        {promos === null ? <div className="empty">Loading…</div> : !promos.length ? (
          <div className="empty"><TicketPercent size={28} /><b>No promo codes yet</b>Create one for an affiliate or a promotion.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Code</th><th>Type</th><th className="num">Off</th><th>Status</th><th className="num">Orders</th><th className="num">Sales</th><th className="num">Discount</th><th>Limits</th><th /></tr></thead>
              <tbody>
                {promos.map(p => {
                  const u = usage.get(p.id) || blankUsage();
                  const [label, cls] = status(p);
                  return (
                    <Fragment key={p.id}>
                      <tr className="clickable" onClick={() => setOpen(open === p.id ? null : p.id)}>
                        <td><b>{p.code}</b>{!p.stripe.livemode && <span className="chip chip--muted chip--plain" style={{ marginLeft: 6 }}>Test</span>}</td>
                        <td>{p.kind === 'affiliate' ? `Affiliate · ${p.affiliate?.name}` : 'Standard'}</td>
                        <td className="num">{p.percentOff}%</td>
                        <td><span className={`chip ${cls}`}>{label}</span></td>
                        <td className="num">{u.orders.length}{p.maxRedemptions ? ` / ${p.maxRedemptions}` : ''}</td>
                        <td className="num">{aud(u.salesAUD, 2)}</td>
                        <td className="num">{aud(u.discountAUD, 2)}</td>
                        <td>{p.expiresAt ? `Ends ${day(p.expiresAt)}` : 'No end date'}</td>
                        <td><div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn--sm" onClick={e => { e.stopPropagation(); setEditing(p); }} aria-label={`Edit ${p.code}`}><Pencil size={13} /> Edit</button>
                          <button className="btn btn--sm" onClick={e => { e.stopPropagation(); toggle(p); }}>{p.active ? 'Turn off' : 'Turn on'}</button>
                          <button className="btn btn--sm" style={{ padding: "0 8px" }} aria-label={`Delete ${p.code}`} disabled={!!onOrders.get(p.id)}
                            title={onOrders.get(p.id) ? 'Used on an order, so it can’t be deleted. Turn it off instead.' : `Delete ${p.code}`}
                            onClick={e => { e.stopPropagation(); setDeleting(p); }}><Trash2 size={14} /></button>
                        </div></td>
                      </tr>
                      {open === p.id && (
                        <tr><td colSpan={9}>
                          {u.orders.length ? u.orders.map(o => (
                            <div key={o.id} className="promo-order">
                              <Link to={`/orders/${encodeURIComponent(o.id)}`}>#{orderNo(o)}</Link>
                              <span>{o.createdAt?.toDate().toLocaleDateString('en-AU')}</span>
                              <span>{o.customer?.name || o.customer?.email}</span>
                              <span className="num">{aud(o.totalAUD, 2)}</span>
                            </div>
                          )) : <span className="muted">No orders with this code yet.</span>}
                          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Created {day(p.createdAt)}{p.affiliate?.email ? ` · ${p.affiliate.email}` : ''} · Stripe {p.stripe.promotionCodeId}</div>
                          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            {onOrders.get(p.id)
                              ? <span className="muted" style={{ fontSize: 12.5 }}>Used on {onOrders.get(p.id)} {onOrders.get(p.id) === 1 ? 'order' : 'orders'}, so it can’t be deleted. Turn it off instead.</span>
                              : <button className="btn btn--sm btn--danger" onClick={() => setDeleting(p)}><Trash2 size={14} /> Delete code</button>}
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleting && (
        <ConfirmDelete title={`Delete ${deleting.code}?`} action="Delete code" onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await adminApi(`/promos/${encodeURIComponent(deleting.id)}/delete`, {});
            setDeleting(null); setOpen(null); toast.show(`${deleting.code} deleted`); load();
          }}>
          <p>No order has used {deleting.code}, so it can go. It stops working at checkout straight away and leaves this list.</p>
          <p className="muted">Stripe doesn’t let promotion codes be deleted, so it’s switched off there and stays in your Stripe dashboard as an inactive code.</p>
          {deleting.code === WELCOME_CODE && <div className="notice notice--warn">{WELCOME_CODE} is the code the welcome email gives everyone who signs up. Without it, that email offers a code that won’t work.</div>}
        </ConfirmDelete>
      )}
      {creating && <PromoForm onClose={() => setCreating(false)} onSaved={m => { setCreating(false); toast.show(m); load(); }} />}
      {editing && <PromoForm promo={editing} used={onOrders.get(editing.id) || 0} onClose={() => setEditing(null)} onSaved={m => { setEditing(null); toast.show(m); load(); }} />}
      {toast.node}
    </>
  );
}
