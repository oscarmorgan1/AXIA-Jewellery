import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, ExternalLink, FileText, Gem, Gift, Mail, Package, PenLine, Plus, Receipt, Send, Truck, Undo2 } from 'lucide-react';
import { siteUrl } from '../firebase';
import { useOrders, usePieces, useReturns } from '../lib/data';
import { OUTCOME_LABEL, RETURNABLE, isOpen, outcomeOf, returnChip, statusText, stepIndex, trackerSteps } from '../lib/returns';
import ReturnDrawer from '../components/ReturnDrawer';
import ReturnTracker from '../components/ReturnTracker';
import { isMaking, orderPieceStage, orderSlots, shortDate, stageLabel } from '../lib/pieces';
import { AssignPieceDrawer, PieceDrawer } from '../components/PieceDrawer';
import { adminApi } from '../lib/api';
import { aud } from '../lib/format';
import { STATUS_LABEL, STATUS_OPTIONS, itemCount, orderNo } from '../lib/orders';
import Drawer from '../components/Drawer';
import { useToast } from '../components/Toast';
import ComposeEmail from '../components/ComposeEmail';
import { statusChip } from './Orders';
import type { Order, Piece, Return, Tracking } from '../types';
import { SkeletonPage } from '../components/Skeleton';
import { openBlank, packingSlipHtml, taxInvoiceHtml, writeDocument } from '../lib/documents';

type Receipt = { url: string; card: { brand: string; last4: string } | null };
const BLOCKED = 'Your browser blocked the new tab. Allow pop-ups for the admin portal and try again.';

/** Paperwork and Stripe links for one order, behind a single Actions button. */
function OrderActions({ order, pieces, stripeUrl, onMessage, onReturn }: { order: Order; pieces: Piece[]; stripeUrl: string; onMessage: (m: string) => void; onReturn: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const paid = !!order.stripe?.paymentIntent && order.status !== 'pending';

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); wrap.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  const receipt = () => adminApi<Receipt>(`/orders/${encodeURIComponent(order.id)}/receipt`);

  function packingSlip() {
    setOpen(false);
    const w = openBlank('Preparing packing slip…');
    if (!w) return onMessage(BLOCKED);
    writeDocument(w, packingSlipHtml(order, pieces));
  }

  async function invoice() {
    setOpen(false);
    const w = openBlank('Preparing tax invoice…');
    if (!w) return onMessage(BLOCKED);
    let o = order;
    // The card used is on the Stripe charge; fetch it once so the invoice can name it.
    if (paid && !order.stripe?.card) {
      try { const r = await receipt(); o = { ...order, stripe: { ...order.stripe, card: r.card } }; } catch { /* the invoice still works without it */ }
    }
    writeDocument(w, taxInvoiceHtml(o));
  }

  async function stripeReceipt() {
    setOpen(false);
    if (order.stripe?.receiptUrl) { window.open(order.stripe.receiptUrl, '_blank', 'noopener'); return; }
    const w = openBlank('Opening the Stripe receipt…');
    if (!w) return onMessage(BLOCKED);
    try {
      const r = await receipt();
      w.opener = null;
      w.location.replace(r.url);
    } catch (e) {
      w.close();
      onMessage((e as Error).message);
    }
  }

  const keys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };

  return (
    <div className="menu" ref={wrap}>
      <button className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)}>Actions <ChevronDown size={16} /></button>
      {open && (
        <div className="menu__list" role="menu" aria-label="Order actions" onKeyDown={keys}>
          <button role="menuitem" onClick={packingSlip}><Package size={16} /><span>Print packing slip<small>Items and address, no prices</small></span></button>
          <button role="menuitem" onClick={invoice} disabled={!paid}><FileText size={16} /><span>Print tax invoice<small>{paid ? 'GST invoice for the customer' : 'Once the order is paid'}</small></span></button>
          <button role="menuitem" onClick={() => { setOpen(false); onReturn(); }} disabled={!RETURNABLE.includes(order.status || '')}><Undo2 size={16} /><span>Start a return<small>{RETURNABLE.includes(order.status || '') ? 'Pieces coming back, with a return slip' : order.status === 'in_return' ? 'A return is already open' : 'Once the order has shipped'}</small></span></button>
          <div className="menu__rule" role="separator" />
          <button role="menuitem" onClick={stripeReceipt} disabled={!paid}><Receipt size={16} /><span>Stripe receipt<small>{paid ? 'The receipt Stripe emailed' : 'No payment yet'}</small></span></button>
          {stripeUrl && <a role="menuitem" href={stripeUrl} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}><ExternalLink size={16} /><span>Open in Stripe<small>Payment, refunds and disputes</small></span></a>}
        </div>
      )}
    </div>
  );
}

const when = (d?: { toDate(): Date }) => d ? d.toDate().toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '–';
const img = (src?: string) => !src ? '' : /^https?:/.test(src) ? src : siteUrl('/' + src.replace(/^\//, ''));

const EMAIL_LABEL: Record<string, string> = {
  confirmation: 'Order confirmation', 'status:in_progress': 'In progress', 'status:shipped': 'Shipped',
  'status:fulfilled': 'Delivered', 'status:cancelled': 'Cancelled', message: 'Message from you', reply: 'Reply to inquiry',
};

/** Pick a new status, then confirm exactly what (if anything) gets emailed before it's saved. */
function StatusDrawer({ order, pieces, initial, onClose, onDone, onAssign, onReturn }: { order: Order; pieces: Piece[]; initial?: string; onClose: () => void; onDone: (msg: string) => void; onAssign: (line: number) => void; onReturn: () => void }) {
  const current = order.status || 'pending';
  const [status, setStatus] = useState(initial || STATUS_OPTIONS.find(o => o.key !== current && o.key !== 'paid')?.key || 'in_progress');
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
  // Shipping: every unit on the packing slip should have its registry piece assigned first.
  const slots = orderSlots(order, pieces);
  const missing = slots.reduce((a, s) => a + s.missing, 0);
  const withMaker = slots.reduce((a, s) => a + s.assigned.filter(isMaking).length, 0);
  const [packed, setPacked] = useState(false);
  const shipBlocked = status === 'shipped' && !packed;
  // Once it has shipped, cancelling means bringing the pieces back: a return.
  const viaReturn = status === 'cancelled' && RETURNABLE.includes(current);

  async function save() {
    setBusy(true); setError('');
    try {
      const r = await adminApi<{ pieces?: number; email: { resendId: string | null; status: string } | null }>(`/orders/${encodeURIComponent(order.id)}/status`, {
        status, notify: willEmail, note, ...(status === 'shipped' ? { tracking } : {}),
      });
      onDone(`Marked ${opt.label.toLowerCase()}${r.pieces ? `, ${r.pieces} piece${r.pieces === 1 ? '' : 's'} dated shipped` : ''}${r.email ? (r.email.resendId ? `, emailed ${email}` : ', email not sent (Resend isn’t set up)') : ''}`);
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
      {viaReturn
        ? <button className="btn btn--primary" onClick={onReturn}><Undo2 size={16} /> Start a return</button>
        : <button className="btn btn--primary" onClick={() => setConfirming(true)} disabled={status === current || shipBlocked}>Review change</button>}
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
            <div className="ship-check">
              <h3>What’s in the box</h3>
              <ul>
                {slots.map(s => (
                  <li key={s.line}>
                    <span>{s.item.name} <small>× {s.item.qty || 1}</small><br />
                      {s.assigned.length ? <small className="mono">{s.assigned.map(p => p.serial).join(', ')}</small> : null}</span>
                    {s.missing
                      ? <button className="btn btn--sm" onClick={() => onAssign(s.line)}><span className="no">{s.missing} without a serial</span></button>
                      : <span className="ok"><Check size={15} /> In registry</span>}
                  </li>
                ))}
              </ul>
              {withMaker > 0 && <div className="notice notice--warn">{withMaker} {withMaker === 1 ? 'piece is' : 'pieces are'} still marked as with the maker. Shipping marks {withMaker === 1 ? 'it' : 'them'} received.</div>}
              {missing > 0 && <div className="notice notice--warn">{missing} {missing === 1 ? 'piece has' : 'pieces have'} no serial assigned.</div>}
              <label className="check"><input type="checkbox" checked={packed} onChange={e => setPacked(e.target.checked)} />
                {missing ? 'Ship anyway: I’ve checked the box against the packing slip' : 'I’ve checked these serials against the packing slip'}</label>
              <small className="muted">Each assigned piece gets today as its shipped date.</small>
            </div>
          )}
          {status === 'shipped' && (
            <div className="form-grid">
              <label className="field">Carrier<input className="input" value={tracking.carrier} onChange={e => setTracking(t => ({ ...t, carrier: e.target.value }))} /></label>
              <label className="field">Tracking number<input className="input" value={tracking.number} onChange={e => setTracking(t => ({ ...t, number: e.target.value }))} /></label>
              <label className="field full">Tracking link<input className="input" placeholder="https://auspost.com.au/mypost/track/details/…" value={tracking.url} onChange={e => setTracking(t => ({ ...t, url: e.target.value }))} /></label>
            </div>
          )}
          {viaReturn && <div className="notice notice--warn"><Undo2 size={15} /> This order has shipped, so cancelling it starts a return. The order shows <b>In return</b> while you track the label, the parcel coming back and the refund, then becomes Cancelled.</div>}
          {!viaReturn && <>
          <label className="field">Note for the customer (optional)
            <textarea className="textarea" value={note} placeholder={opt.email ? 'Added to the email, e.g. “Thanks for your patience.”' : 'Kept on the order history'} onChange={e => setNote(e.target.value)} />
          </label>
          {opt.email ? (
            <label className="check"><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} disabled={!email} />
              Email the customer {email ? `(${email})` : '(no email on this order)'}
            </label>
          ) : <div className="card__sub">No email is sent for this status.</div>}
          </>}
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
          {status === 'shipped' && <div className={`notice ${missing ? 'notice--warn' : 'notice--ok'}`}><Gem size={15} /> {missing
            ? `${slots.reduce((a, s) => a + s.assigned.length, 0)} pieces marked shipped today. ${missing} still without a serial.`
            : `All ${slots.reduce((a, s) => a + s.assigned.length, 0)} pieces in the registry get today as their shipped date.`}</div>}
          {status === 'cancelled' && <div className="notice notice--error">Cancelling doesn’t refund the payment. Refund it in Stripe too.</div>}
          {note && <p className="card__sub">Note: “{note}”</p>}
        </div>
      )}
    </Drawer>
  );
}

/** A return on this order: where it's at, and a link to manage it. */
function ReturnCard({ ret }: { ret: Return }) {
  const day = (d: Date | null) => (d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '');
  const steps = trackerSteps(ret, day);
  return (
    <div className="card return-card">
      <div className="return-card__head">
        <Undo2 size={16} />
        <b>Return {ret.number}</b>
        <span className="chip chip--muted">{OUTCOME_LABEL[outcomeOf(ret)]}{ret.exchange?.wanted ? `: ${ret.exchange.wanted}` : ''}</span>
        <span className={`chip ${returnChip(ret.status)}`}>{statusText(ret)}</span>
        <small className="muted mono">{ret.items.map(i => i.serial).filter(Boolean).join(', ')}</small>
        <span className="spacer" />
        <Link className={`btn btn--sm${isOpen(ret) ? ' btn--primary' : ''}`} to={`/returns/${encodeURIComponent(ret.id)}`}>{isOpen(ret) ? 'Manage return' : 'View return'}</Link>
      </div>
      {(isOpen(ret) || ret.status === 'closed') && <ReturnTracker steps={steps} at={stepIndex(ret)} />}
    </div>
  );
}

export default function OrderDetail() {
  const { id = '' } = useParams();
  const { data, loading, error } = useOrders();
  const [changing, setChanging] = useState(false);
  const [composing, setComposing] = useState(false);
  const [assigning, setAssigning] = useState<number | null>(null);
  const [viewing, setViewing] = useState<Piece | null>(null);
  const [fromShip, setFromShip] = useState(false); // reopen the status drawer on Shipped after assigning
  const [returning, setReturning] = useState(false);
  const { data: pieces } = usePieces();
  const { data: returns } = useReturns();
  const nav = useNavigate();
  const toast = useToast();
  const order = data.find(o => o.id === id);

  if (loading) return <SkeletonPage />;
  if (error) return <div className="notice notice--error">{error.message}</div>;
  if (!order) return <div className="card empty"><b>Order not found</b><Link className="btn" to="/orders">Back to orders</Link></div>;

  const test = order.stripe?.livemode === false;
  const stripeUrl = order.stripe?.paymentIntent ? `https://dashboard.stripe.com/${test ? 'test/' : ''}payments/${order.stripe.paymentIntent}` : '';
  const a = order.shipping?.address;
  const history = [...(order.statusHistory || [])].reverse();
  const emails = [...(order.emails || [])].reverse();
  const engraved = (order.items || []).filter(i => i.engraving);
  const slots = orderSlots(order, pieces);
  const stage = ['paid', 'in_progress'].includes(order.status || '') ? stageLabel(orderPieceStage(order, pieces)) : null;
  const orderReturns = returns.filter(r => r.orderId === order.id && r.status !== 'withdrawn');
  const openReturn = orderReturns.find(isOpen);

  return (
    <>
      <div className="page-head">
        <Link to="/orders" className="icon-btn" aria-label="Back"><ArrowLeft size={18} /></Link>
        <h1>Order #{orderNo(order)}</h1>
        {statusChip(order.status)}
        {engraved.length > 0 && <span className="chip chip--ice" title={engraved.map(i => `${i.name}: ${i.engraving}`).join('\n')}><PenLine size={12} /> Custom engraving</span>}
        {stage && <span className={`chip ${stage.chip} chip--plain`}><Gem size={12} /> {stage.text}</span>}
        {test && <span className="chip chip--muted">Test</span>}
        <span className="spacer" />
        <OrderActions order={order} pieces={pieces} stripeUrl={stripeUrl} onMessage={toast.show} onReturn={() => setReturning(true)} />
        {order.customer?.email && <button className="btn" onClick={() => setComposing(true)}><Send size={16} /> Message customer</button>}
        {order.status === 'in_return'
          ? openReturn && <Link className="btn btn--primary" to={`/returns/${encodeURIComponent(openReturn.id)}`}><Undo2 size={16} /> Manage return</Link>
          : !['pending', 'refunded'].includes(order.status || 'pending') && <button className="btn btn--primary" onClick={() => setChanging(true)}>Change status</button>}
      </div>
      <p className="card__sub" style={{ marginTop: -8 }}>Placed {when(order.createdAt)} · {itemCount(order)} items · {aud(order.totalAUD, 2)}</p>


      <div className="editor">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          {orderReturns.map(r => <ReturnCard key={r.id} ret={r} />)}
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
                    <div className="piece-slots">
                      {slots[n]?.assigned.map(p => (
                        <button key={p.key} className={`piece-tag${isMaking(p) ? ' piece-tag--making' : ''}${p.returnId ? ' piece-tag--return' : ''}`} onClick={() => setViewing(p)}
                          title={p.shippedOn ? `Shipped ${shortDate(p.shippedOn)}` : isMaking(p) ? `With the maker since ${shortDate(p.purchasedOn)}` : 'In hand, not shipped yet'}>
                          <Gem size={12} /> <span className="mono">{p.serial}</span>{isMaking(p) ? <small>With maker</small> : null}{p.returnId ? <small>In return</small> : p.shippedOn ? <Check size={12} /> : null}
                        </button>
                      ))}
                      {!!slots[n]?.missing && <button className="piece-tag piece-tag--missing" onClick={() => setAssigning(n)}><Plus size={12} /> Assign piece{slots[n].missing > 1 ? ` (${slots[n].missing} left)` : ''}</button>}
                    </div>
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
                    <b>{h.status === 'piece_swapped' ? 'Piece exchanged' : STATUS_LABEL[h.status] || h.status}</b>
                    {h.swaps?.map((x, i) => <small key={i}>Serial <span className="mono">{x.fromSerial || 'without a serial'}</span> replaced by <span className="mono">{x.toSerial}</span> ({x.productName}){h.returnId ? <> · <Link to={`/returns/${encodeURIComponent(h.returnId)}`}>{h.returnNumber || 'return'}</Link></> : null}</small>)}
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
              <dt>Name</dt><dd>{order.customer?.email ? <Link to={`/customers/${encodeURIComponent(order.customer.email.toLowerCase())}`}>{order.customer?.name || order.customer.email}</Link> : order.customer?.name || '–'}</dd>
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

      {composing && order.customer?.email && <ComposeEmail target={{ to: order.customer.email, name: order.customer.name, subject: `About your AXIA order #${orderNo(order)}`, orderId: order.id, orderNumber: orderNo(order) }}
        onClose={() => setComposing(false)} onSent={m => { setComposing(false); toast.show(m); }} />}
      {changing && assigning === null && <StatusDrawer order={order} pieces={pieces} initial={fromShip ? 'shipped' : undefined} onClose={() => { setChanging(false); setFromShip(false); }} onDone={m => { setChanging(false); setFromShip(false); toast.show(m); }} onAssign={line => { setFromShip(true); setAssigning(line); }} onReturn={() => { setChanging(false); setReturning(true); }} />}
      {returning && <ReturnDrawer order={order} pieces={pieces} onClose={() => setReturning(false)} onDone={(m, id) => { setReturning(false); toast.show(m); nav(`/returns/${encodeURIComponent(id)}`); }} />}
      {assigning !== null && <AssignPieceDrawer order={order} line={assigning} pieces={pieces} onClose={() => setAssigning(null)} onDone={m => { setAssigning(null); toast.show(m); }} />}
      {viewing && <PieceDrawer piece={pieces.find(p => p.key === viewing.key) || viewing} pieces={pieces} onClose={() => setViewing(null)} onDone={m => { setViewing(null); toast.show(m); }} />}
      {toast.node}
    </>
  );
}
