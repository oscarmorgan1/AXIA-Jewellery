import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PenLine, Search } from 'lucide-react';
import { useOrders } from '../lib/data';
import { aud } from '../lib/format';
import { STATUS_LABEL, hasEngraving, itemCount, orderNo, statusClass } from '../lib/orders';
import type { Order } from '../types';

export function statusChip(s?: string) {
  return <span className={`chip ${statusClass(s)}`}>{STATUS_LABEL[s || ''] || (s ? s[0].toUpperCase() + s.slice(1) : 'Pending')}</span>;
}

export function OrdersTable({ orders, empty }: { orders: Order[]; empty: string }) {
  const nav = useNavigate();
  if (!orders.length) return <div className="empty"><b>No orders yet</b>{empty}</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Pieces</th><th>Status</th><th>Items</th><th className="num">Total</th></tr></thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id} className="clickable" onClick={() => nav(`/orders/${encodeURIComponent(o.id)}`)}>
              <td>#{orderNo(o)}{o.stripe && o.stripe.livemode === false && <span className="chip chip--muted chip--plain" style={{ marginLeft: 6 }}>Test</span>}</td>
              <td>{o.createdAt ? o.createdAt.toDate().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'}</td>
              <td>{o.customer?.name || o.customer?.email || '–'}</td>
              <td>
                {(o.items || []).map(i => i.name).join(', ') || '–'}
                {hasEngraving(o) && <span className="chip chip--ice chip--plain" style={{ marginLeft: 6 }} title="Has custom engraving"><PenLine size={12} /> Engraving</span>}
              </td>
              <td>{statusChip(o.status)}</td>
              <td>{itemCount(o)} items</td>
              <td className="num">{aud(o.totalAUD, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Filter = 'open' | 'shipped' | 'done' | 'all';
const OPEN = ['pending', 'paid', 'in_progress'];

export default function Orders() {
  const { data, loading, error } = useOrders();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const counts = {
    open: data.filter(o => OPEN.includes(o.status || 'pending')).length,
    shipped: data.filter(o => o.status === 'shipped').length,
    done: data.filter(o => ['fulfilled', 'cancelled', 'refunded'].includes(o.status || '')).length,
    all: data.length,
  };
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.filter(o => {
      const st = o.status || 'pending';
      if (filter === 'open' && !OPEN.includes(st)) return false;
      if (filter === 'shipped' && st !== 'shipped') return false;
      if (filter === 'done' && !['fulfilled', 'cancelled', 'refunded'].includes(st)) return false;
      return !s || JSON.stringify([o.id, o.orderNumber, o.customer, o.promotionCode, o.items?.map(i => [i.name, i.engraving])]).toLowerCase().includes(s);
    });
  }, [data, q, filter]);
  return (
    <>
      <div className="page-head"><h1>Orders</h1></div>
      <div className="card">
        <div className="card__head">
          <div className="segmented">
            {([['open', 'To do'], ['shipped', 'Shipped'], ['done', 'Closed'], ['all', 'All']] as [Filter, string][]).map(([k, l]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l} <span style={{ opacity: .55 }}>{counts[k]}</span></button>
            ))}
          </div>
          <span className="spacer" />
          <div className="search"><Search size={16} /><input placeholder="Search orders, customers, engraving" value={q} onChange={e => setQ(e.target.value)} /></div>
        </div>
        {error && <div className="notice notice--error">{error.message}</div>}
        {loading ? <div className="empty">Loading…</div> : <OrdersTable orders={shown} empty={filter === 'open' ? 'Nothing waiting on you. New paid orders land here.' : 'No orders match.'} />}
      </div>
    </>
  );
}
