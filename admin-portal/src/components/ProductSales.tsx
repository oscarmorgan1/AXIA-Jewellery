import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useOrders } from '../lib/data';
import { aud } from '../lib/format';
import { orderNo, salesByProduct } from '../lib/orders';

/** Sales and order history for one product, from paid orders. */
export default function ProductSales({ id }: { id: string }) {
  const { data: orders, loading } = useOrders();
  const s = useMemo(() => salesByProduct(orders).get(id), [orders, id]);
  const sizes = useMemo(() => {
    const m = new Map<string, number>();
    for (const { item } of s?.lines || []) {
      const k = [item.width, item.length, item.colour].filter(Boolean).join(' · ') || 'One size';
      m.set(k, (m.get(k) || 0) + (item.qty || 1));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [s]);
  const engraved = (s?.lines || []).filter(l => l.item.engraving).length;

  return (
    <div className="card">
      <div className="card__head"><h2>Sales</h2></div>
      {loading ? <div className="card__sub">Loading…</div> : !s ? <div className="card__sub">No sales yet.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <dl className="kv">
            <dt>Units sold</dt><dd>{s.units}</dd>
            <dt>Orders</dt><dd>{s.orders}</dd>
            <dt>Revenue</dt><dd>{aud(s.revenueAUD, 2)}</dd>
            <dt>Average price</dt><dd>{aud(s.revenueAUD / s.units, 2)}</dd>
            {engraved > 0 && <><dt>Engraved</dt><dd>{engraved}</dd></>}
            <dt>Last ordered</dt><dd>{s.last ? s.last.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'}</dd>
          </dl>
          {sizes.length > 0 && (
            <div>
              <div className="field" style={{ marginBottom: 6 }}>Best-selling sizes</div>
              <dl className="kv">{sizes.slice(0, 5).map(([k, n]) => <Fragment key={k}><dt>{k}</dt><dd>{n}</dd></Fragment>)}</dl>
            </div>
          )}
          <div>
            <div className="field" style={{ marginBottom: 6 }}>Recent orders</div>
            {[...s.lines].sort((a, b) => (b.order.createdAt?.toDate().getTime() ?? 0) - (a.order.createdAt?.toDate().getTime() ?? 0)).slice(0, 8).map(({ order, item }, n) => (
              <div key={n} className="sale-line">
                <Link to={`/orders/${encodeURIComponent(order.id)}`}>#{orderNo(order)}</Link>
                <span>{order.createdAt?.toDate().toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                <span>× {item.qty}</span>
                <span className="num">{aud(item.priceAUD * item.qty)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
