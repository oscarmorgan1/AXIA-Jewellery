import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, Banknote, Check, Gem, Mail, Package, PackageCheck, Printer, Tag, Truck, X } from 'lucide-react';
import Drawer from '../components/Drawer';
import ReturnTracker from '../components/ReturnTracker';
import { useToast } from '../components/Toast';
import { SkeletonPage } from '../components/Skeleton';
import { adminApi } from '../lib/api';
import { useOrders, usePieces, useReturnAddress, useReturns } from '../lib/data';
import { isMaking } from '../lib/pieces';
import { aud } from '../lib/format';
import { STATUS_LABEL } from '../lib/orders';
import { OUTCOME_LABEL, RETURN_LABEL, isOpen, leftToRefund, outcomeOf, refundedSoFar, returnChip, statusText, stepIndex, suggestedRefund, trackerSteps } from '../lib/returns';
import { openBlank, returnSlipHtml, shipFrom, writeDocument } from '../lib/documents';
import type { Order, Piece, Return, Tracking } from '../types';

const when = (d?: { toDate(): Date } | Date | null) => {
  const t = d && 'toDate' in d ? d.toDate() : d;
  return t ? t.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '–';
};
const shortDay = (d: Date | null) => (d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '');

type Step = 'label_created' | 'received' | 'refunded' | 'replacement_sent' | 'closed' | 'declined';

/** What each step emails, and its button. */
const STEP: Record<Step, { title: string; button: string; email: string; notifyByDefault: boolean }> = {
  label_created: { title: 'Return label', button: 'Save label', email: '“Your return label is ready”, with the label', notifyByDefault: true },
  received: { title: 'Product received', button: 'Mark received', email: '“We’ve received your return”', notifyByDefault: true },
  refunded: { title: 'Payment refunded', button: 'Record refund', email: '“Your refund is on its way”, with the amount', notifyByDefault: true },
  replacement_sent: { title: 'Replacement sent', button: 'Send replacement', email: '“Your replacement is on its way”, with tracking', notifyByDefault: true },
  closed: { title: 'Finish the return', button: 'Finish return', email: '“Your return is complete”', notifyByDefault: false },
  declined: { title: 'Decline the return', button: 'Decline return', email: '“About your return”, with your note', notifyByDefault: true },
};

/** Switches the end goal between a refund and an exchange, before any money or replacement goes out. */
function OutcomeDrawer({ ret, onClose, onDone }: { ret: Return; onClose: () => void; onDone: (m: string) => void }) {
  const current = outcomeOf(ret);
  const to = current === 'refund' ? 'exchange' : 'refund';
  const [wanted, setWanted] = useState(ret.exchange?.wanted || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try { await adminApi(`/returns/${encodeURIComponent(ret.id)}/outcome`, { outcome: to, wanted: wanted.trim() }); onDone(`Changed to ${to === 'exchange' ? 'an exchange' : 'a refund'}`); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Drawer title={`Change to ${to === 'exchange' ? 'an exchange' : 'a refund'}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <span style={{ flex: 1 }} />
      <button className="btn btn--primary" onClick={save} disabled={busy || (to === 'exchange' && wanted.trim().length < 2)}>{busy ? 'Saving…' : 'Change end goal'}</button>
    </>}>
      {error && <div className="notice notice--error">{error}</div>}
      <p className="card__sub" style={{ margin: 0 }}>{to === 'exchange'
        ? 'Instead of refunding, you’ll send a replacement once the piece is back. The order isn’t cancelled.'
        : 'Instead of a replacement, you’ll refund once the piece is back. Returning everything cancels the order.'} The customer sees the change in their account. No email is sent.</p>
      {to === 'exchange' && <label className="field">What they’d like instead
        <input className="input" value={wanted} onChange={e => setWanted(e.target.value)} placeholder="e.g. same chain in 18in" autoFocus /></label>}
    </Drawer>
  );
}

/** Moves a return on one step, confirming what's emailed (and refunded) before anything is saved. */
function StepDrawer({ ret, order, pieces, to, onClose, onDone }: { ret: Return; order?: Order; pieces: Piece[]; to: Step; onClose: () => void; onDone: (m: string) => void }) {
  const exchange = outcomeOf(ret) === 'exchange';
  const s = to === 'closed' && exchange
    ? { title: 'Finish the exchange', button: 'Finish exchange', email: '“Your exchange is complete”', notifyByDefault: false }
    : STEP[to];
  const [ship, setShip] = useState<Tracking>({ carrier: ret.replacement?.carrier || 'Australia Post', number: ret.replacement?.number || '', url: ret.replacement?.url || '' });
  // One replacement per returned item: in-stock pieces, the same product first.
  const stock = pieces.filter(p => (!p.orderId || p.replacesReturnId === ret.id) && !p.returnId && !isMaking(p));
  const [keys, setKeys] = useState<string[]>(() => ret.items.map((_, i) => ret.replacement?.pieces?.find(x => x.line === ret.items[i].line)?.key || ''));
  const [label, setLabel] = useState<Tracking>({ carrier: ret.label?.carrier || 'Australia Post', number: ret.label?.number || '', url: ret.label?.url || '' });
  const left = order ? leftToRefund(order) : 0;
  const already = order ? refundedSoFar(order) : 0;
  const [amount, setAmount] = useState(order ? String(suggestedRefund(order, ret)) : '');
  const canStripe = !!order?.stripe?.paymentIntent;
  const [viaStripe, setViaStripe] = useState(canStripe && !already);
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(s.notifyByDefault);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const email = ret.customer?.email || '';
  const willEmail = notify && !!email;
  const n = Number(amount);
  const back = ret.full && !exchange ? 'Cancelled' : STATUS_LABEL[ret.orderStatusBefore || ''] || 'its last status';
  const invalid = (to === 'label_created' && !label.number?.trim() && !label.url?.trim())
    || (to === 'replacement_sent' && !ship.number?.trim() && !ship.url?.trim())
    || (to === 'refunded' && !(n > 0 && n <= left + 0.001))
    || (to === 'declined' && note.trim().length < 4);

  async function save() {
    setBusy(true); setError('');
    try {
      const r = await adminApi<{ refund: { id: string } | null; email: { resendId: string | null } | null }>(`/returns/${encodeURIComponent(ret.id)}/step`, {
        to, note: note.trim(), notify: willEmail,
        ...(to === 'label_created' ? { label } : {}),
        ...(to === 'refunded' ? { refund: { amountAUD: n, stripe: viaStripe } } : {}),
        ...(to === 'replacement_sent' ? { replacement: { ...ship, keys } } : {}),
      });
      onDone(`${s.title}${r.refund ? `: ${aud(n, 2)} refunded in Stripe` : ''}${r.email ? (r.email.resendId ? `, emailed ${email}` : ', email not sent (Resend isn’t set up)') : ''}`);
    } catch (e) { setError((e as Error).message); setConfirming(false); } finally { setBusy(false); }
  }

  const footer = confirming ? (
    <>
      <button className="btn" onClick={() => setConfirming(false)} disabled={busy}>Back</button>
      <span style={{ flex: 1 }} />
      <button className={`btn ${to === 'declined' ? 'btn--danger' : 'btn--primary'}`} onClick={save} disabled={busy}>{busy ? 'Saving…' : to === 'refunded' && viaStripe ? `Refund ${aud(n, 2)}` : s.button}</button>
    </>
  ) : (
    <>
      <button className="btn" onClick={onClose}>Cancel</button>
      <span style={{ flex: 1 }} />
      <button className="btn btn--primary" onClick={() => setConfirming(true)} disabled={invalid}>Review</button>
    </>
  );

  return (
    <Drawer title={`${s.title} · ${ret.number}`} onClose={onClose} footer={footer}>
      {error && <div className="notice notice--error">{error}</div>}
      {!confirming ? (
        <>
          {to === 'label_created' && (
            <div className="form-grid">
              <label className="field">Carrier<input className="input" value={label.carrier} onChange={e => setLabel(l => ({ ...l, carrier: e.target.value }))} /></label>
              <label className="field">Tracking number<input className="input" value={label.number} onChange={e => setLabel(l => ({ ...l, number: e.target.value }))} /></label>
              <label className="field full">Label link (optional)<input className="input" value={label.url} placeholder="https://… the PDF or page the customer prints" onChange={e => setLabel(l => ({ ...l, url: e.target.value }))} /></label>
            </div>
          )}
          {to === 'received' && <p className="card__sub" style={{ margin: 0 }}>Check what’s in the parcel against the return slip: {ret.items.map(i => i.serial || i.productName).join(', ')}.</p>}
          {to === 'replacement_sent' && (
            <>
              {ret.exchange?.wanted && <div className="notice notice--ok"><ArrowLeftRight size={15} /> They asked for: <b>{ret.exchange.wanted}</b></div>}
              {ret.items.map((item, i) => {
                const same = stock.filter(p => p.productName === item.productName);
                const other = stock.filter(p => p.productName !== item.productName);
                return (
                  <label key={i} className="field">Replacing {item.productName}{item.serial ? ` (${item.serial})` : ''}
                    <select className="select" value={keys[i]} onChange={e => setKeys(k => k.map((v, n) => (n === i ? e.target.value : v)))}>
                      <option value="">No serial yet</option>
                      {same.length > 0 && <optgroup label={item.productName}>{same.map(p => <option key={p.key} value={p.key}>{p.serial} · {p.variant || 'no size'}</option>)}</optgroup>}
                      {other.length > 0 && <optgroup label="Other pieces in stock">{other.map(p => <option key={p.key} value={p.key}>{p.serial} · {p.productName} {p.variant || ''}</option>)}</optgroup>}
                    </select>
                  </label>
                );
              })}
              <small className="muted">The picked piece joins the order in place of the returned one, dated shipped today, and shows in their Pieces.</small>
              <div className="form-grid">
                <label className="field">Carrier<input className="input" value={ship.carrier} onChange={e => setShip(l => ({ ...l, carrier: e.target.value }))} /></label>
                <label className="field">Tracking number<input className="input" value={ship.number} onChange={e => setShip(l => ({ ...l, number: e.target.value }))} /></label>
                <label className="field full">Tracking link (optional)<input className="input" value={ship.url} placeholder="https://auspost.com.au/mypost/track/details/…" onChange={e => setShip(l => ({ ...l, url: e.target.value }))} /></label>
              </div>
            </>
          )}
          {to === 'refunded' && (
            <>
              <label className="field">Amount (AUD)
                <input className="input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
                <small className="muted">{ret.full ? 'Everything is coming back, so this is the whole order including shipping.' : 'The returned pieces, less their share of any discount.'} {aud(left, 2)} is left unrefunded on this order{already ? ` (${aud(already, 2)} already refunded)` : ''}.</small>
              </label>
              <div className="status-pick">
                <label className={`status-opt${viaStripe ? ' on' : ''}`}>
                  <input type="radio" name="via" checked={viaStripe} disabled={!canStripe} onChange={() => setViaStripe(true)} />
                  <span><b>Refund in Stripe now</b><small>{canStripe ? 'Sends the money back to their card straight away.' : 'This order has no Stripe payment.'}</small></span>
                </label>
                <label className={`status-opt${!viaStripe ? ' on' : ''}`}>
                  <input type="radio" name="via" checked={!viaStripe} onChange={() => setViaStripe(false)} />
                  <span><b>Already refunded</b><small>You refunded it in the Stripe dashboard (or another way). Just record it.</small></span>
                </label>
              </div>
            </>
          )}
          {to === 'closed' && exchange && <p className="card__sub" style={{ margin: 0 }}>
            The exchange is done, so order #{ret.orderNumber} goes back to <b>{back}</b>. Returned pieces with a serial go back into stock in the registry; the replacement stays on the order.</p>}
          {to === 'closed' && !exchange && <p className="card__sub" style={{ margin: 0 }}>
            {ret.full ? <>Every piece on the order came back, so order #{ret.orderNumber} becomes <b>Cancelled</b>.</> : <>Part of the order came back, so order #{ret.orderNumber} goes back to <b>{back}</b>.</>}
            {' '}Returned pieces with a serial leave the order and go back into stock in the registry.</p>}
          <label className="field">{to === 'declined' ? 'Why (emailed to the customer)' : 'Note (optional)'}
            <textarea className="textarea" value={note} onChange={e => setNote(e.target.value)} placeholder={to === 'declined' ? 'e.g. “Engraved pieces can only be returned if faulty.”' : willEmail ? 'Added to the email and shown in their account' : 'Kept on the return'} />
          </label>
          <label className="check"><input type="checkbox" checked={notify} disabled={!email || to === 'declined'} onChange={e => setNotify(e.target.checked)} />
            Email the customer {email ? `(${email})` : '(no email)'}</label>
        </>
      ) : (
        <div className="confirm">
          <p>Return <b>{ret.number}</b> moves from <b>{RETURN_LABEL[ret.status]}</b> to <b>{to === 'closed' ? (exchange ? 'Exchanged' : ret.full ? 'Cancelled' : 'Closed') : RETURN_LABEL[to]}</b>.</p>
          {to === 'replacement_sent' && <div className="notice notice--ok"><Truck size={15} /> {keys.filter(Boolean).length
            ? <>{keys.filter(Boolean).map(k => pieces.find(p => p.key === k)?.serial || k).join(', ')} {keys.filter(Boolean).length === 1 ? 'joins' : 'join'} order #{ret.orderNumber}, shipped today.</>
            : 'No replacement serial is recorded. You can add it later by sending again.'}</div>}
          {to === 'refunded' && (viaStripe
            ? <div className="notice notice--error"><Banknote size={15} /> This refunds <b>{aud(n, 2)}</b> to the customer’s card in Stripe straight away. It can’t be undone.</div>
            : <div className="notice notice--ok">Nothing is refunded in Stripe; {aud(n, 2)} is recorded as refunded.</div>)}
          {to === 'closed' && <div className="notice notice--warn">Order #{ret.orderNumber} becomes <b>{back}</b>.</div>}
          {to === 'declined' && <div className="notice notice--warn">Order #{ret.orderNumber} goes back to <b>{STATUS_LABEL[ret.orderStatusBefore || ''] || 'its last status'}</b> and the pieces stay with the customer.</div>}
          {willEmail ? <div className="notice notice--warn"><Mail size={15} /> This emails <b>{email}</b>: {s.email}.</div> : <div className="notice notice--ok">No email will be sent to the customer.</div>}
          {note && <p className="card__sub">Note: “{note}”</p>}
        </div>
      )}
    </Drawer>
  );
}

export default function ReturnDetail() {
  const { id = '' } = useParams();
  const { data, loading, error } = useReturns();
  const { data: orders } = useOrders();
  const { data: pieces } = usePieces();
  const address = useReturnAddress();
  const [step, setStep] = useState<Step | null>(null);
  const [switching, setSwitching] = useState(false);
  const toast = useToast();
  const ret = data.find(r => r.id === id);

  if (loading) return <SkeletonPage />;
  if (error) return <div className="notice notice--error">{error.message}</div>;
  if (!ret) return <div className="card empty"><b>Return not found</b><Link className="btn" to="/returns">Back to returns</Link></div>;

  const order = orders.find(o => o.id === ret.orderId);
  const at = stepIndex(ret);
  const ended = ret.status === 'declined' || ret.status === 'withdrawn';
  const steps = trackerSteps(ret, shortDay);
  const exchange = outcomeOf(ret) === 'exchange';
  const canSwitch = ['requested', 'label_created', 'received'].includes(ret.status);
  const history = [...(ret.history || [])].reverse();
  const emails = [...(ret.emails || [])].reverse();

  function slip() {
    const w = openBlank('Preparing return slip…');
    if (!w) return toast.show('Your browser blocked the new tab. Allow pop-ups for the admin portal and try again.');
    writeDocument(w, returnSlipHtml({
      number: ret!.number, orderNumber: ret!.orderNumber, from: order ? shipFrom(order) : [ret!.customer.name].filter(Boolean),
      to: address.data, reason: ret!.reason, items: ret!.items, label: ret!.label, startedOn: ret!.createdAt?.toDate() || null,
    }));
  }

  return (
    <>
      <div className="page-head">
        <Link to="/returns" className="icon-btn" aria-label="Back"><ArrowLeft size={18} /></Link>
        <h1>Return {ret.number}</h1>
        <span className={`chip ${exchange ? 'chip--ice' : 'chip--warn'}`}>{exchange ? <ArrowLeftRight size={12} /> : <Banknote size={12} />} {OUTCOME_LABEL[outcomeOf(ret)]}</span>
        <span className={`chip ${returnChip(ret.status)}`}>{statusText(ret)}</span>
        {ret.source === 'portal' && <span className="chip chip--muted">From their account</span>}
        <span className="spacer" />
        <button className="btn" onClick={slip}><Printer size={16} /> Return slip</button>
        <Link className="btn" to={`/orders/${encodeURIComponent(ret.orderId)}`}><Package size={16} /> Order #{ret.orderNumber}</Link>
      </div>
      <p className="card__sub" style={{ marginTop: -8 }}>Started {when(ret.createdAt)} · {ret.items.length} {ret.items.length === 1 ? 'piece' : 'pieces'} · {ret.full ? 'whole order' : 'part of the order'}</p>

      <div className="editor">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <div className="card return-card">
            <div className="return-card__head">
              {exchange ? <ArrowLeftRight size={16} /> : <Banknote size={16} />}
              <span>End goal: <b>{exchange ? `Exchange${ret.exchange?.wanted ? ` for ${ret.exchange.wanted}` : ''}` : 'Refund'}</b></span>
              <span className="spacer" />
              {canSwitch && <button className="btn btn--sm" onClick={() => setSwitching(true)}>Change to {exchange ? 'refund' : 'exchange'}</button>}
            </div>
            <ReturnTracker steps={steps} at={at} ended={ended} />
            {ended && <div className="notice notice--warn">{ret.status === 'withdrawn' ? 'The customer withdrew this request.' : 'This return was declined.'} The order went back to {STATUS_LABEL[ret.orderStatusBefore || ''] || 'its last status'}.</div>}
            {isOpen(ret) && (
              <div className="return-next">
                {ret.status === 'requested' && <>
                  <button className="btn btn--primary" onClick={() => setStep('label_created')}><Tag size={16} /> Add return label</button>
                  <button className="btn" onClick={() => setStep('received')}><PackageCheck size={16} /> Mark received</button>
                  <button className="btn" onClick={() => setStep('declined')}><X size={16} /> Decline</button>
                </>}
                {ret.status === 'label_created' && <>
                  <button className="btn btn--primary" onClick={() => setStep('received')}><PackageCheck size={16} /> Mark received</button>
                  <button className="btn" onClick={() => setStep('label_created')}><Tag size={16} /> Change label</button>
                  <button className="btn" onClick={() => setStep('declined')}><X size={16} /> Decline</button>
                </>}
                {ret.status === 'received' && (exchange
                  ? <button className="btn btn--primary" onClick={() => setStep('replacement_sent')}><Truck size={16} /> Send replacement</button>
                  : <button className="btn btn--primary" onClick={() => setStep('refunded')}><Banknote size={16} /> Refund payment</button>)}
                {ret.status === 'refunded' && <button className="btn btn--primary" onClick={() => setStep('closed')}><Check size={16} /> {ret.full ? 'Cancel the order' : 'Close the return'}</button>}
                {ret.status === 'replacement_sent' && <>
                  <button className="btn btn--primary" onClick={() => setStep('closed')}><Check size={16} /> Finish exchange</button>
                  <button className="btn" onClick={() => setStep('replacement_sent')}><Truck size={16} /> Change replacement</button>
                </>}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card__head"><h2>Coming back</h2></div>
            <div className="order-items">
              {ret.items.map((i, n) => (
                <div className="order-item" key={n} style={{ gridTemplateColumns: '56px minmax(0, 1fr) auto' }}>
                  <div className="order-item__img order-item__img--icon"><Gem size={20} /></div>
                  <div className="order-item__body">
                    <b>{i.productId ? <Link to={`/products/${encodeURIComponent(i.productId)}`}>{i.productName}</Link> : i.productName}</b>
                    <small>{i.variant}</small>
                    {i.engraving && <small>Engraved “{i.engraving}”</small>}
                  </div>
                  <div className="order-item__price">{i.serial ? <Link className="mono" to={i.key ? `/pieces?open=${encodeURIComponent(i.key)}` : `/pieces?q=${encodeURIComponent(i.serial)}`}>{i.serial}</Link> : <span className="muted">No serial</span>}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card__head"><h2>History</h2></div>
            <ol className="timeline">
              {history.map((h, n) => (
                <li key={n}>
                  <b>{h.outcome ? `End goal: ${OUTCOME_LABEL[h.outcome as 'refund' | 'exchange'] || h.outcome}` : h.status === 'closed' ? statusText(ret) : h.updated ? (h.status === 'replacement_sent' ? 'Replacement changed' : 'Label changed') : RETURN_LABEL[h.status] || h.status}</b>
                  <small>{when(h.at)} · {h.by}{h.emailed ? ' · customer emailed' : ''}</small>
                  {h.note && <p>“{h.note}”</p>}
                </li>
              ))}
            </ol>
          </div>

          <div className="card">
            <div className="card__head"><div><h2>Emails</h2><div className="card__sub">Every email about this return, with its Resend ID.</div></div></div>
            {emails.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Email</th><th>Sent</th><th>Resend ID</th></tr></thead>
                  <tbody>
                    {emails.map((e, n) => (
                      <tr key={n}>
                        <td>{e.subject}<br /><small className="muted">{e.to}</small></td>
                        <td>{when(e.sentAt)}</td>
                        <td>{e.resendId ? <a href={`https://resend.com/emails/${e.resendId}`} target="_blank" rel="noreferrer"><code>{e.resendId}</code></a> : <span className="chip chip--warn chip--plain">Not sent</span>}</td>
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
              <dt>Name</dt><dd>{ret.customerEmail ? <Link to={`/customers/${encodeURIComponent(ret.customerEmail)}`}>{ret.customer.name || ret.customerEmail}</Link> : ret.customer.name || '–'}</dd>
              <dt>Email</dt><dd>{ret.customer.email ? <a href={`mailto:${ret.customer.email}`}>{ret.customer.email}</a> : '–'}</dd>
              <dt>Order</dt><dd><Link to={`/orders/${encodeURIComponent(ret.orderId)}`}>#{ret.orderNumber}</Link>{order ? ` · ${STATUS_LABEL[order.status || ''] || order.status}` : ''}</dd>
            </dl>
          </div>
          <div className="card">
            <div className="card__head"><h2>Reason</h2></div>
            <p style={{ margin: 0 }}><b>{ret.reason}</b></p>
            {ret.customerNote && <p className="card__sub">“{ret.customerNote}”</p>}
            {ret.notes && <p className="card__sub">Internal: {ret.notes}</p>}
          </div>
          <div className="card">
            <div className="card__head"><h2>{exchange ? 'Label and replacement' : 'Label and refund'}</h2></div>
            <dl className="kv kv--left">
              <dt>Label</dt><dd>{ret.label ? <>{ret.label.carrier} {ret.label.url ? <a href={ret.label.url} target="_blank" rel="noreferrer">{ret.label.number || 'Open label'}</a> : ret.label.number}</> : '–'}</dd>
              {exchange && <><dt>Wants</dt><dd>{ret.exchange?.wanted || '–'}</dd></>}
              {exchange && <><dt>Sent</dt><dd>{ret.replacement ? <>{ret.replacement.carrier} {ret.replacement.url ? <a href={ret.replacement.url} target="_blank" rel="noreferrer">{ret.replacement.number || 'Tracking'}</a> : ret.replacement.number}
                {(ret.replacement.pieces || []).map(p => <div key={p.key}><Link className="mono" to={`/pieces?open=${encodeURIComponent(p.key)}`}>{p.serial}</Link> <small className="muted">{p.variant}</small></div>)}</> : '–'}</dd></>}
              {!exchange && <dt>Refund</dt>}{!exchange && <dd>{ret.refund ? `${aud(ret.refund.amountAUD, 2)} · ${ret.refund.via === 'stripe' ? 'in Stripe' : 'recorded'}` : '–'}</dd>}
              {ret.refund?.stripeRefundId && <><dt>Stripe</dt><dd><code>{ret.refund.stripeRefundId}</code></dd></>}
            </dl>
          </div>
          {!address.loading && !address.data && (
            <div className="notice notice--warn">No return address yet. Add it under <Link to="/returns">Returns</Link> so it prints on return slips.</div>
          )}
        </div>
      </div>

      {switching && <OutcomeDrawer ret={ret} onClose={() => setSwitching(false)} onDone={m => { setSwitching(false); toast.show(m); }} />}
      {step && <StepDrawer ret={ret} order={order} pieces={pieces} to={step} onClose={() => setStep(null)} onDone={m => { setStep(null); toast.show(m); }} />}
      {toast.node}
    </>
  );
}

