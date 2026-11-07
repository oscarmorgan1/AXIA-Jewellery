import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, MessageSquare, Receipt, Truck } from 'lucide-react';
import { siteUrl } from '../../src/firebase';
import { accountApi } from '../api';
import { STAGES, aud, day, statusOf, useMyOrder, type MyOrder } from '../orders';
import { thumb } from './Orders';
import { useMyPieces } from '../pieces';

/** Ordered → Being made → Shipped → Delivered, with the date each step happened. */
function Progress({ order }: { order: MyOrder }) {
  const at = STAGES.findIndex(s => s.key === order.status);
  const when = (key: string) => {
    const hits = order.timeline.filter(t => t.status === key && t.at);
    return hits.length ? hits[hits.length - 1].at : key === 'paid' ? order.placedAt : null;
  };
  return (
    <ol className="pt-steps" aria-label="Order progress">
      {STAGES.map((s, i) => {
        const done = at >= i;
        return (
          <li key={s.key} className={`pt-step${done ? ' done' : ''}${at === i ? ' now' : ''}`} aria-current={at === i ? 'step' : undefined}>
            <span className="pt-step__bar" />
            <b>{s.label}</b>
            <small>{done ? day(when(s.key)) : ''}</small>
          </li>
        );
      })}
    </ol>
  );
}

function ReceiptButton({ order }: { order: MyOrder }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (order.status === 'pending') return null;
  async function open() {
    if (order.receiptUrl) { window.open(order.receiptUrl, '_blank', 'noopener'); return; }
    setBusy(true); setError(null);
    // Opened first, so the browser doesn't block it as a pop-up after the wait.
    const tab = window.open('', '_blank');
    try {
      const { url } = await accountApi<{ url: string }>(`/orders/${encodeURIComponent(order.id)}/receipt`);
      if (tab) tab.location.href = url; else location.href = url;
    } catch (e) { tab?.close(); setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <>
      <button className="btn btn--sm" onClick={open} disabled={busy}><Receipt size={15} /> {busy ? 'Opening…' : 'Receipt'}</button>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
    </>
  );
}

/** /portal/orders/:id  One order, live: progress, tracking, items, totals. */
export default function OrderDetail() {
  const { id = '' } = useParams();
  const order = useMyOrder(id);
  const { pieces } = useMyPieces();
  const serials = (pieces || []).filter(p => p.orderId === id);
  useEffect(() => { document.title = order ? `Order #${order.orderNumber} · AXIA` : 'Order · AXIA'; }, [order]);

  if (order === undefined) return <div className="page pt-page"><div className="card"><div className="skeleton" style={{ height: 160 }} /></div></div>;
  if (order === null) {
    return (
      <div className="page pt-page">
        <div className="card empty"><b>We couldn’t find that order</b><p>It may have been placed with a different email address.</p>
          <Link className="btn" to="/orders">All orders</Link></div>
      </div>
    );
  }

  const st = statusOf(order.status);
  const closed = order.status === 'cancelled' || order.status === 'refunded';
  const a = order.shipping.address;
  const notes = order.timeline.filter(t => t.note);
  return (
    <div className="page pt-page">
      <div className="page-head">
        <Link to="/orders" className="icon-btn" aria-label="All orders"><ArrowLeft size={18} /></Link>
        <h1>Order #{order.orderNumber}</h1>
        <span className={`chip ${st.chip}`}>{st.label}</span>
        <p className="lede">Placed {day(order.placedAt)}</p>
      </div>

      <div className="card">
        {closed ? (
          <div className="notice notice--warn">
            {order.status === 'refunded' ? 'This order was refunded to your original payment method.' : 'This order was cancelled. If you paid, your refund goes back to your original payment method, usually within 5 to 10 business days.'}
          </div>
        ) : order.status === 'pending' ? (
          <div className="notice notice--warn">We’re waiting for your payment to clear. We’ll start on your piece as soon as it does.</div>
        ) : (
          <>
            <Progress order={order} />
            <p className="card__sub pt-next">
              {order.status === 'paid' && 'Every piece is hand-set and made to order, so allow approximately 3 to 5 weeks before it ships.'}
              {order.status === 'in_progress' && 'Our setters are working on your piece. We’ll email you the day it ships.'}
              {order.status === 'shipped' && 'Your piece is on its way in its AXIA box.'}
              {order.status === 'fulfilled' && 'Delivered. Wear it well.'}
            </p>
          </>
        )}
        {order.tracking && !closed && (
          <div className="pt-track">
            <Truck size={18} />
            <span><b>{order.tracking.carrier || 'Tracking'}</b>{order.tracking.number && <> · <span className="mono">{order.tracking.number}</span></>}</span>
            <span className="spacer" />
            {order.tracking.url && <a className="btn btn--primary btn--sm" href={order.tracking.url} target="_blank" rel="noreferrer">Track parcel <ExternalLink size={14} /></a>}
          </div>
        )}
        {notes.length > 0 && (
          <div className="pt-notes">
            {notes.map((n, i) => <p key={i}><small>{day(n.at)} · from AXIA</small>{n.note}</p>)}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card__head"><h2>Items</h2><span className="spacer" /><ReceiptButton order={order} /></div>
        <ul className="pt-bag">
          {order.items.map((i, n) => (
            <li key={n} className="pt-bag__line pt-bag__line--order">
              {i.image ? <img src={thumb(i.image)} alt="" onError={e => { e.currentTarget.src = siteUrl(i.image); }} /> : <span className="pt-bag__ph" />}
              <div className="pt-bag__body">
                <b>{i.name}{i.qty > 1 ? ` × ${i.qty}` : ''}</b>
                {i.options && <small>{i.options}</small>}
                {i.engraving && <small>Engraving: “{i.engraving}”</small>}
              </div>
              <span className="pt-bag__price">{aud(i.priceAUD * i.qty)}</span>
            </li>
          ))}
          {order.gift && (
            <li className="pt-bag__line pt-bag__line--order">
              <span className="pt-bag__ph" />
              <div className="pt-bag__body"><b>{order.gift.name}</b><small>{order.gift.length ? `${order.gift.length} · ` : ''}Free gift</small></div>
              <span className="pt-bag__price">Free</span>
            </li>
          )}
        </ul>
        {serials.length > 0 && (
          <p className="card__sub pt-serials">
            Serial{serials.length > 1 ? 's' : ''}: {serials.map((p, i) => <span key={p.key}>{i ? ', ' : ''}<Link to="/pieces" className="mono">{p.serial}</Link></span>)}
          </p>
        )}
        <dl className="kv pt-totals">
          <dt>Subtotal</dt><dd>{aud(order.subtotalAUD)}</dd>
          {order.discountAUD > 0 && <><dt>Discount{order.promotionCode ? ` (${order.promotionCode})` : ''}</dt><dd>-{aud(order.discountAUD)}</dd></>}
          <dt>{order.shipping.method || 'Shipping'}</dt><dd>{order.shipping.amountAUD ? aud(order.shipping.amountAUD) : 'Free'}</dd>
          <dt><b>Total (AUD)</b></dt><dd>{aud(order.totalAUD)}</dd>
        </dl>
      </div>

      <div className="grid-2 grid-2--even pt-two">
        {a && (
          <div className="card">
            <div className="card__head"><h2>Shipping to</h2></div>
            <address className="address">{order.shipping.name && <>{order.shipping.name}<br /></>}{a.line1}{a.line2 ? <><br />{a.line2}</> : null}<br />{[a.city, a.state, a.postal_code].filter(Boolean).join(' ')}</address>
          </div>
        )}
        <div className="card">
          <div className="card__head"><h2>Need a hand?</h2></div>
          <p className="card__sub" style={{ marginTop: 0 }}>Sizing, engraving or delivery questions: we’re happy to help.</p>
          <a className="btn btn--sm" style={{ marginTop: 12 }} href={`/support?order=${encodeURIComponent(order.orderNumber)}#contact`}><MessageSquare size={15} /> Contact us</a>
        </div>
      </div>
    </div>
  );
}
