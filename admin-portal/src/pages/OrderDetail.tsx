import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Gift, Mail, PenLine, Truck } from 'lucide-react';
import { siteUrl } from '../firebase';
import { useOrders } from '../lib/data';
import { adminApi } from '../lib/api';
import { aud } from '../lib/format';
import { STATUS_LABEL, STATUS_OPTIONS, itemCount, orderNo } from '../lib/orders';
import Drawer from '../components/Drawer';
import { useToast } from '../components/Toast';
import { statusChip } from './Orders';
import type { Order, Tracking } from '../types';

const when = (d?: { toDate(): Date }) => d ? d.toDate().toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '–';
const img = (src?: string) => !src ? '' : /^https?:/.test(src) ? src : siteUrl('/' + src.replace(/^\//, ''));

const EMAIL_LABEL: Record<string, string> = {
  confirmation: 'Order confirmation', 'status:in_progress': 'In progress', 'status:shipped': 'Shipped',
  'status:fulfilled': 'Delivered', 'status:cancelled': 'Cancelled',
};

/** Pick a new status, then confirm exactly what (if anything) gets emailed before it's saved. */
function StatusDrawer({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: (msg: string) => void }) {
  const current = order.status || 'pending';
  const [status, setStatus] = useState(STATUS_OPTIONS.find(o => o.key !== current && o.key !== 'paid')?.key || 'in_progress');
  const [notify, setNotify] = useState(true);
  const [tracking, setTracking] = useState<Tracking>({ carrier: order.tracking?.carrier || 'Australia Post', number: order.tracking?.number || '', url: order.tracking?.url || '' });
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const opt = STATUS_OPTIONS.find(o => o.key === status)!;
  const email = order.customer?.email || '';
  const willEmail = notify && !!opt.email && !!email;
  const already = (order.emails || []).some(e => e.type === `status:${status}` && e.status === 'sent');

  async function save() {
    setBusy(true); setError('');
    try {
      const r = await adminApi<{ email: { resendId: string | null; status: string } | null }>(`/orders/${encodeURIComponent(order.id)}/status`, {
        status, notify: willEmail, note, ...(status === 'shipped' ? { tracking } : {}),
      });
      onDone(`Marked ${opt.label.toLowerCase()}${r.email ? (r.email.resendId ? `, emailed ${email}` : ', email not sent (Resend isn’t set up)') : ''}`);
    } catch (e) {
      setError((e as Error).message); setConfirming(false);
    } finally { setBusy(false); }
  }

  const footer = confirming ? (
    <>
      <button className="btn" onClick={() => setConfirming(false)} disabled={busy}>Back</button>
      <span className="spacer" style={{ flex: 1 }} />
      <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : willEmail ? 'Change status and email' : 'Change status'}</button>
    </>
  ) : (
    <>
      <button className="btn" onClick={onClose}>Cancel</button>
      <span className="spacer" style={{ flex: 1 }} />
      <button className="btn btn--primary" onClick={() => setConfirming(true)} disabled={status === current}>Review change</button>
    </>
  );

  return (
    <Drawer title={`Order #${orderNo(order)} status`} onClose={onClose} footer={footer}>
      {error && <div className="notice notice--error">{error}</div>}
      {!confirming ? (
        <>
          <div className="status-pick">
            {STATUS_OPTIONS.map(o => (
              <label key={o.key} className={`status-opt${status === o.key ? ' on' : ''}${o.key === current ? ' current' : ''}`}>
                <input type="radio" name="status" checked={status === o.key} disabled={o.key === current} onChange={() => setStatus(o.key)} />
                <span><b>{o.label}</b>{o.key === current && <em> (current)</em>}<small>{o.hint}</small></span>
              </label>
            ))}
          </div>
          {status === 'shipped' && (
            <div className="form-grid">
              <label className="field">Carrier<input className="input" value={tracking.carrier} onChange={e => setTracking(t => ({ ...t, carrier: e.target.value }))} /></label>
              <label className="field">Tracking number<input className="input" value={tracking.number} onChange={e => setTracking(t => ({ ...t, number: e.target.value }))} /></label>
              <label className="field full">Tracking link<input className="input" placeholder="https://auspost.com.au/mypost/track/details/…" value={tracking.url} onChange={e => setTracking(t => ({ ...t, url: e.target.value }))} /></label>
            </div>
          )}
          <label className="field">Note for the customer (optional)
            <textarea className="textarea" value={note} placeholder={opt.email ? 'Added to the email, e.g. “Thanks for your patience.”' : 'Kept on the order history'} onChange={e => setNote(e.target.value)} />
          </label>
          {opt.email ? (
            <label className="check"><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} disabled={!email} />
              Email the customer {email ? `(${email})` : '(no email on this order)'}
            </label>
          ) : <div className="card__sub">No email is sent for this status.</div>}
        </>
      ) : (
        <div className="confirm">
          <p>You’re changing order <b>#{orderNo(order)}</b> from <b>{STATUS_LABEL[current] || current}</b> to <b>{opt.label}</b>.</p>
          {willEmail ? (
            <div className="notice notice--warn"><Mail size={15} /> This will email <b>{email}</b> straight away: {opt.email}.
              {status === 'shipped' && !tracking.number && ' No tracking number is included.'}
              {already && ' They have already had this email once.'}</div>
          ) : (
            <div className="notice notice--ok">No email will be sent to the customer.</div>
          )}
          {status === 'cancelled' && <div className="notice notice--error">Cancelling doesn’t refund the payment. Refund it in Stripe too.</div>}
          {note && <p className="card__sub">Note: “{note}”</p>}
        </div>
      )}
    </Drawer>
  );
}

export default function OrderDetail() {
  const { id = '' } = useParams();
  const { data, loading, error } = useOrders();
  const [changing, setChanging] = useState(false);
  const toast = useToast();
  const order = data.find(o => o.id === id);

  if (loading) return <div className="card empty">Loading…</div>;
  if (error) return <div className="notice notice--error">{error.message}</div>;
  if (!order) return <div className="card empty"><b>Order not found</b><Link className="btn" to="/orders">Back to orders</Link></div>;

  const test = order.stripe?.livemode === false;
  const stripeUrl = order.stripe?.paymentIntent ? `https://dashboard.stripe.com/${test ? 'test/' : ''}payments/${order.stripe.paymentIntent}` : '';
  const a = order.shipping?.address;
  const history = [...(order.statusHistory || [])].reverse();
  const emails = [...(order.emails || [])].reverse();
  const engraved = (order.items || []).filter(i => i.engraving);

  return (
    <>
      <div className="page-head">
        <Link to="/orders" className="icon-btn" aria-label="Back"><ArrowLeft size={18} /></Link>
        <h1>Order #{orderNo(order)}</h1>
        {statusChip(order.status)}
        {test && <span className="chip chip--muted">Test</span>}
        <span className="spacer" />
        {stripeUrl && <a className="btn" href={stripeUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Stripe</a>}
        {!['pending', 'refunded'].includes(order.status || 'pending') && <button className="btn btn--primary" onClick={() => setChanging(true)}>Change status</button>}
      </div>
      <p className="card__sub" style={{ marginTop: -8 }}>Placed {when(order.createdAt)} · {itemCount(order)} items · {aud(order.totalAUD, 2)}</p>

      {engraved.length > 0 && (
        <div className="engrave-alert"><PenLine size={18} />
          <div><b>Custom engraving on this order</b>
            {engraved.map((i, n) => <div key={n}>{i.name}: <span className="engrave-text">{i.engraving}</span></div>)}
          </div>
        </div>
      )}

      <div className="editor">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <div className="card">
            <div className="card__head"><h2>Items</h2></div>
            <div className="order-items">
              {(order.items || []).map((i, n) => (
                <div className="order-item" key={n}>
                  <div className="order-item__img">{i.image ? <img src={img(i.image)} alt="" /> : null}</div>
                  <div className="order-item__body">
                    <b>{i.id ? <Link to={`/products/${encodeURIComponent(i.id)}`}>{i.name}</Link> : i.name}</b>
                    <small>{[i.width, i.length, i.colour].filter(Boolean).join(' · ') || i.options}</small>
                    {i.engraving && <div className="engrave-line"><PenLine size={13} /> Engraving: <span className="engrave-text">{i.engraving}</span></div>}
                  </div>
                  <div className="order-item__qty">× {i.qty}</div>
                  <div className="order-item__price">{aud(i.priceAUD * i.qty, 2)}</div>
                </div>
              ))}
              {order.gift && (
                <div className="order-item">
                  <div className="order-item__img order-item__img--icon"><Gift size={20} /></div>
                  <div className="order-item__body"><b>{order.gift.name}</b><small>Free gift{order.gift.length ? ` · ${order.gift.length}` : ''}</small></div>
                  <div className="order-item__qty">× 1</div>
                  <div className="order-item__price">Free</div>
                </div>
              )}
            </div>
            <dl className="kv" style={{ marginTop: 16 }}>
              <dt>Subtotal</dt><dd>{aud(order.subtotalAUD, 2)}</dd>
              {(order.discountAUD || 0) > 0 && <><dt>Discount{order.promotionCode ? ` (${order.promotionCode})` : ''}</dt><dd>−{aud(order.discountAUD, 2)}</dd></>}
              <dt>Shipping{order.shipping?.method ? ` (${order.shipping.method})` : ''}</dt><dd>{order.shipping?.amountAUD ? aud(order.shipping.amountAUD, 2) : 'Free'}</dd>
              <dt><b>Total paid</b></dt><dd>{aud(order.totalAUD, 2)}</dd>
            </dl>
          </div>

          <div className="card">
            <div className="card__head"><h2>History</h2></div>
            {history.length ? (
              <ol className="timeline">
                {history.map((h, n) => (
                  <li key={n}>
                    <b>{STATUS_LABEL[h.status] || h.status}</b>
                    <small>{when(h.at)} · {h.by === 'stripe' ? 'Stripe' : h.by}{h.emailed ? ' · customer emailed' : ''}</small>
                    {h.tracking?.number && <small>Tracking: {h.tracking.carrier} {h.tracking.number}</small>}
                    {h.note && <p>“{h.note}”</p>}
                  </li>
                ))}
              </ol>
            ) : <div className="card__sub">No history recorded for this order.</div>}
          </div>

          <div className="card">
            <div className="card__head"><div><h2>Emails</h2><div className="card__sub">Every email sent to the customer, with its Resend ID.</div></div></div>
            {emails.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Email</th><th>Sent</th><th>To</th><th>Resend ID</th></tr></thead>
                  <tbody>
                    {emails.map((e, n) => (
                      <tr key={n}>
                        <td>{EMAIL_LABEL[e.type] || e.type}<br /><small className="muted">{e.subject}</small></td>
                        <td>{when(e.sentAt)}</td>
                        <td>{e.to}</td>
                        <td>{e.resendId
                          ? <a href={`https://resend.com/emails/${e.resendId}`} target="_blank" rel="noreferrer"><code>{e.resendId}</code></a>
                          : <span className="chip chip--warn chip--plain">Not sent</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="card__sub">No emails sent yet.</div>}
          </div>
        </div>

        <div className="editor__side">
          <div className="card">
            <div className="card__head"><h2>Customer</h2></div>
            <dl className="kv kv--left">
              <dt>Name</dt><dd>{order.customer?.name || '–'}</dd>
              <dt>Email</dt><dd>{order.customer?.email ? <a href={`mailto:${order.customer.email}`}>{order.customer.email}</a> : '–'}</dd>
              <dt>Phone</dt><dd>{order.customer?.phone ? <a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a> : '–'}</dd>
            </dl>
          </div>
          <div className="card">
            <div className="card__head"><h2>Ship to</h2></div>
            {a ? (
              <address className="address">
                {order.shipping?.name || order.customer?.name}<br />
                {a.line1}{a.line2 ? <><br />{a.line2}</> : null}<br />
                {[a.city, a.state, a.postal_code].filter(Boolean).join(' ')}<br />
                {a.country === 'AU' ? 'Australia' : a.country}
              </address>
            ) : <div className="card__sub">No address.</div>}
            <div className="card__sub" style={{ marginTop: 10 }}>{order.shipping?.method || 'Shipping'}</div>
            {order.tracking?.number && (
              <div className="tracking"><Truck size={15} /> {order.tracking.carrier} {order.tracking.url
                ? <a href={order.tracking.url} target="_blank" rel="noreferrer">{order.tracking.number}</a> : order.tracking.number}</div>
            )}
          </div>
          <div className="card">
            <div className="card__head"><h2>Payment</h2></div>
            <dl className="kv">
              <dt>Promo code</dt><dd>{order.promotionCode || '–'}</dd>
              <dt>Mode</dt><dd>{test ? 'Test' : 'Live'}</dd>
              <dt>Payment</dt><dd>{stripeUrl ? <a href={stripeUrl} target="_blank" rel="noreferrer">{order.stripe!.paymentIntent!.slice(0, 14)}…</a> : '–'}</dd>
            </dl>
          </div>
        </div>
      </div>

      {changing && <StatusDrawer order={order} onClose={() => setChanging(false)} onDone={m => { setChanging(false); toast.show(m); }} />}
      {toast.node}
    </>
  );
}
