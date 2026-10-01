import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useOrders } from '../lib/data';
import { aud } from '../lib/format';
import type { Order } from '../types';

export function statusChip(s?: string) {
  const cls = s === 'paid' || s === 'fulfilled' ? 'chip--good' : s === 'refunded' || s === 'cancelled' ? 'chip--bad' : 'chip--warn';
  return <span className={`chip ${cls}`}>{s ? s[0].toUpperCase() + s.slice(1) : 'Pending'}</span>;
}

export function OrdersTable({ orders, empty }: { orders: Order[]; empty: string }) {
  if (!orders.length) return <div className="empty"><b>No orders yet</b>{empty}</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Pieces</th><th>Status</th><th>Items</th><th className="num">Total</th></tr></thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id}>
              <td>#{o.id.slice(-6).toUpperCase()}</td>
              <td>{o.createdAt ? o.createdAt.toDate().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'}</td>
              <td>{o.customer?.name || o.customer?.email || '–'}</td>
              <td>{(o.items || []).map(i => i.name).join(', ') || '–'}</td>
              <td>{statusChip(o.status)}</td>
              <td>{(o.items || []).reduce((a, i) => a + (i.qty || 1), 0)} items</td>
              <td className="num">{aud(o.totalAUD, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Orders() {
  const { data, loading, error } = useOrders();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? data.filter(o => JSON.stringify([o.id, o.customer, o.items?.map(i => i.name)]).toLowerCase().includes(s)) : data;
  }, [data, q]);
  return (
    <>
      <div className="page-head"><h1>Orders</h1></div>
      <div className="card">
        <div className="card__head">
          <div><h2>All orders</h2><div className="card__sub">Checkout is still a preview, so no orders are recorded yet. Stripe checkout will write paid orders here.</div></div>
          <span className="spacer" />
          <div className="search"><Search size={16} /><input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} /></div>
        </div>
        {error && <div className="notice notice--error">{error.message}</div>}
        {loading ? <div className="empty">Loading…</div> : <OrdersTable orders={shown} empty="Orders will appear here once Stripe checkout is connected." />}
      </div>
    </>
  );
}
