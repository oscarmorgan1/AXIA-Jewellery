import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
import { siteUrl } from '../../src/firebase';
import { aud, day, statusOf, useMyOrders } from '../orders';

export const thumb = (src: string) => { const m = /^\/?(assets\/img\/[^?#]+)\.(jpe?g|png)$/i.exec(src); return siteUrl(m ? `${m[1]}-600.webp` : src); };

/** /portal/orders: every order, newest first. */
export default function Orders() {
  const { orders, error } = useMyOrders();
  useEffect(() => { document.title = 'Orders · AXIA'; }, []);
  return (
    <div className="page pt-page">
      <div className="page-head"><h1>Orders</h1><p className="lede">Follow each order from the setter’s bench to your door.</p></div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      {orders === null ? <div className="card"><div className="skeleton" style={{ height: 88 }} /></div>
        : !orders.length ? (
          <div className="card empty">
            <Package size={28} />
            <b>No orders yet</b>
            <p>When you order, it shows up here with live tracking.</p>
            <a className="btn btn--primary" href="/">Shop AXIA</a>
          </div>
        ) : (
          <div className="pt-orders">
            {orders.map(o => {
              const st = statusOf(o.status);
              const first = o.items[0];
              const more = o.items.length - 1;
              return (
                <Link key={o.id} to={`/orders/${encodeURIComponent(o.id)}`} className="card pt-order">
                  {first?.image ? <img src={thumb(first.image)} alt="" onError={e => { e.currentTarget.src = siteUrl(first.image); }} /> : <span className="pt-bag__ph" />}
                  <div className="pt-order__body">
                    <span className="pt-order__top"><b>#{o.orderNumber}</b><span className={`chip ${st.chip}`}>{st.label}</span></span>
                    <span>{first?.name}{more > 0 ? ` and ${more} more` : ''}</span>
                    <small>{day(o.placedAt)} · {aud(o.totalAUD)}</small>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
    </div>
  );
}
