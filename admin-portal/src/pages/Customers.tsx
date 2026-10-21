import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, PackageOpen, Search, ShoppingBag, Users, Wallet } from 'lucide-react';
import StatCard from '../components/StatCard';
import CountUp from '../components/CountUp';
import { aud } from '../lib/format';
import { personText, usePeople, type Person } from '../lib/customers';

export const fmtDate = (d?: Date) => (d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
export const SOURCE: Record<string, string> = { landing: 'Waitlist page', 'first-drop': 'First Drop page', other: 'Other' };
export const initials = (n: string) => n.split(/[\s@.]+/).filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase();

type Filter = 'all' | 'buyers' | 'open' | 'waitlist';

function csv(rows: Person[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Name', 'Email', 'Phone', 'Instagram', 'Orders', 'Spent (AUD)', 'Open orders', 'Promo codes', 'Interested in', 'Email consent', 'SMS consent', 'Sources', 'First seen', 'Last seen'];
  const body = rows.map(c => [c.name, c.email, c.phone, c.instagram, c.sales.length, c.spentAUD.toFixed(2), c.open.length, c.promoCodes.join('; '), c.interests.join('; '),
    c.emailConsent ? 'Yes' : c.unsubscribedAt ? 'No (unsubscribed)' : 'No', c.smsConsent ? 'Yes' : 'No', c.sources.map(s => SOURCE[s] || s).join('; '), c.first?.toISOString() ?? '', c.last?.toISOString() ?? ''].map(esc).join(','));
  return [head.map(esc).join(','), ...body].join('\n');
}

export default function Customers() {
  const { people, loading, error, signups } = usePeople();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>((params.get('f') as Filter) || 'all');
  const [smsOnly, setSmsOnly] = useState(false);
  const nav = useNavigate();
  const q = params.get('q') || '';

  const counts = {
    all: people.length,
    buyers: people.filter(p => p.sales.length).length,
    open: people.filter(p => p.open.length).length,
    waitlist: people.filter(p => p.signups.length && !p.orders.length).length,
  };
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return people.filter(p => {
      if (filter === 'buyers' && !p.sales.length) return false;
      if (filter === 'open' && !p.open.length) return false;
      if (filter === 'waitlist' && (!p.signups.length || p.orders.length)) return false;
      if (smsOnly && !p.smsConsent) return false;
      return !s || personText(p).includes(s);
    });
  }, [people, q, filter, smsOnly]);

  const revenue = people.reduce((a, p) => a + p.spentAUD, 0);
  const repeat = people.filter(p => p.sales.length > 1).length;

  function exportCsv() {
    const blob = new Blob([csv(shown)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `axia-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Customers</h1><p className="lede" style={{ margin: 0 }}>Everyone who has ordered or joined the waitlist, with their orders and history.</p></div>
        <span className="spacer" />
        <button className="btn" onClick={exportCsv} disabled={!shown.length}><Download size={16} /> Export CSV</button>
      </div>

      <div className="grid-4 stagger">
        <StatCard tone="dark" label="Customers" icon={<Users size={22} />} value={<CountUp value={people.length} />} foot={<>{signups.length} waitlist sign-ups in total</>} />
        <StatCard tone="ice" label="Have ordered" icon={<ShoppingBag size={22} />} value={<CountUp value={counts.buyers} />} foot={`${repeat} ordered more than once`} />
        <StatCard tone="magenta" label="With open orders" icon={<PackageOpen size={22} />} value={<CountUp value={counts.open} />} foot="New, in progress or shipped" />
        <StatCard tone="good" label="Average spend" icon={<Wallet size={22} />} value={counts.buyers ? aud(revenue / counts.buyers) : '–'} foot={`${aud(revenue)} in total`} />
      </div>

      <div className="card">
        <div className="card__head">
          <div className="segmented">
            {([['all', 'All'], ['buyers', 'Ordered'], ['open', 'Open orders'], ['waitlist', 'Waitlist only']] as [Filter, string][]).map(([k, l]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l} <span style={{ opacity: .55 }}>{counts[k]}</span></button>
            ))}
          </div>
          <label className="check"><input type="checkbox" checked={smsOnly} onChange={e => setSmsOnly(e.target.checked)} /> SMS opt-in</label>
          <span className="spacer" />
          <div className="search"><Search size={16} />
            <input placeholder="Name, email, phone, order, engraving…" value={q} onChange={e => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })} />
          </div>
        </div>
        {error && <div className="notice notice--error">{error.message}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Customer</th><th>Phone</th><th className="num">Orders</th><th className="num">Spent</th><th>Open</th><th>Interested in</th><th>Consent</th><th className="num">Last seen</th></tr></thead>
            <tbody className="rows-anim">
              {shown.map(c => (
                <tr key={c.id} className="clickable" onClick={() => nav(`/customers/${encodeURIComponent(c.id)}`)}>
                  <td><div className="prod-cell">
                    <span className="avatar">{initials(c.name || c.email)}</span>
                    <div>{c.name || '–'}<small>{c.email}</small></div>
                  </div></td>
                  <td>{c.phone || '–'}</td>
                  <td className="num">{c.sales.length || '–'}</td>
                  <td className="num">{c.spentAUD ? aud(c.spentAUD) : '–'}</td>
                  <td>{c.open.length ? <span className="chip chip--warn">{c.open.length} open</span> : c.orders.length ? <span className="chip chip--muted chip--plain">None</span> : <span className="chip chip--ice chip--plain">Waitlist</span>}</td>
                  <td style={{ maxWidth: 240 }}>{c.interests[0] || '–'}{c.interests.length > 1 && <span className="sub">+{c.interests.length - 1} more</span>}</td>
                  <td><div className="tags" style={{ gap: 4 }}>
                    {c.emailConsent && <span className="chip chip--ice">Email</span>}
                    {c.unsubscribedAt && <span className="chip chip--plain chip--muted">Unsubscribed</span>}
                    {c.smsConsent && <span className="chip chip--good">SMS</span>}
                  </div></td>
                  <td className="num">{fmtDate(c.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div style={{ padding: 22, display: 'grid', gap: 10 }}>{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 44 }} />)}</div>}
          {!loading && !shown.length && <div className="empty"><Users size={28} /><b>{people.length ? 'No one matches' : 'No customers yet'}</b>{people.length ? 'Try a different search or filter.' : 'People appear here when they order or join the waitlist.'}</div>}
        </div>
      </div>
    </>
  );
}
