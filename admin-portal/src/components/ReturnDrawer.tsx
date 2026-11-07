import { useState } from 'react';
import { Mail, Undo2 } from 'lucide-react';
import Drawer from './Drawer';
import { adminApi } from '../lib/api';
import { orderNo } from '../lib/orders';
import { REASONS, returnUnits } from '../lib/returns';
import type { Order, Piece, Tracking } from '../types';

/**
 * Opens a return on a shipped order: pick the pieces coming back (by serial),
 * the reason, and the return label if it's already made. Then confirm exactly
 * what the customer is emailed.
 */
export default function ReturnDrawer({ order, pieces, onClose, onDone }: { order: Order; pieces: Piece[]; onClose: () => void; onDone: (msg: string, id: string) => void }) {
  const units = returnUnits(order, pieces);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(units.filter(u => !u.busy).length === 1 ? units.filter(u => !u.busy).map(u => u.id) : []));
  const [reason, setReason] = useState('fit');
  const [note, setNote] = useState('');
  const [label, setLabel] = useState<Tracking>({ carrier: 'Australia Post', number: '', url: '' });
  const [notify, setNotify] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const email = order.customer?.email || '';
  const hasLabel = !!(label.number?.trim() || label.url?.trim());
  const chosen = units.filter(u => picked.has(u.id));
  const engraved = chosen.some(u => u.engraving);
  const total = (order.items || []).reduce((a, i) => a + (i.qty || 1), 0);
  const already = Object.values(order.returnedQty || {}).reduce((a, n) => a + (Number(n) || 0), 0);
  const full = chosen.length + already >= total;

  const toggle = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function save() {
    setBusy(true); setError('');
    try {
      const r = await adminApi<{ id: string; number: string; email: { resendId: string | null } | null }>('/returns', {
        orderId: order.id, items: chosen.map(u => ({ line: u.line, key: u.key })), reason, note, notify: notify && !!email,
        ...(hasLabel ? { label } : {}),
      });
      onDone(`Return ${r.number} opened${r.email ? (r.email.resendId ? `, emailed ${email}` : ', email not sent (Resend isn’t set up)') : ''}`, r.id);
    } catch (e) { setError((e as Error).message); setConfirming(false); } finally { setBusy(false); }
  }

  const footer = confirming ? (
    <>
      <button className="btn" onClick={() => setConfirming(false)} disabled={busy}>Back</button>
      <span style={{ flex: 1 }} />
      <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Opening…' : notify && email ? 'Open return and email' : 'Open return'}</button>
    </>
  ) : (
    <>
      <button className="btn" onClick={onClose}>Cancel</button>
      <span style={{ flex: 1 }} />
      <button className="btn btn--primary" onClick={() => setConfirming(true)} disabled={!chosen.length}>Review return</button>
    </>
  );

  return (
    <Drawer title={`Return from order #${orderNo(order)}`} onClose={onClose} footer={footer}>
      {error && <div className="notice notice--error">{error}</div>}
      {!confirming ? (
        <>
          <p className="card__sub" style={{ margin: 0 }}>The order shows <b>In return</b> until the return is finished. Closing a return of every piece cancels the order.</p>
          <div className="field">What’s coming back
            <div className="return-pick">
              {units.length ? units.map(u => (
                <label key={u.id} className={u.busy ? 'off' : ''}>
                  <input type="checkbox" checked={picked.has(u.id)} disabled={!!u.busy} onChange={() => toggle(u.id)} />
                  <span><b>{u.name}</b><small>{[u.variant, u.engraving && `Engraved “${u.engraving}”`].filter(Boolean).join(' · ')}</small></span>
                  <small className={u.key ? 'mono' : ''}>{u.busy || u.serial || 'No serial'}</small>
                </label>
              )) : <div className="card__sub" style={{ padding: 16 }}>Everything on this order has already been returned.</div>}
            </div>
          </div>
          {engraved && <div className="notice notice--warn">Engraved pieces are only returnable if faulty (support page and terms).</div>}
          <label className="field">Reason
            <select className="select" value={reason} onChange={e => setReason(e.target.value)}>
              {REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </label>
          <label className="field">Internal note (optional)
            <textarea className="textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="Only the team sees this" />
          </label>
          <div className="form-grid">
            <label className="field">Return label carrier<input className="input" value={label.carrier} onChange={e => setLabel(l => ({ ...l, carrier: e.target.value }))} /></label>
            <label className="field">Label tracking number<input className="input" value={label.number} placeholder="Leave empty to add it later" onChange={e => setLabel(l => ({ ...l, number: e.target.value }))} /></label>
            <label className="field full">Label link (optional)<input className="input" value={label.url} placeholder="https://… the PDF or page the customer prints" onChange={e => setLabel(l => ({ ...l, url: e.target.value }))} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={notify} disabled={!email} onChange={e => setNotify(e.target.checked)} />
            Email the customer {email ? `(${email})` : '(no email on this order)'}</label>
        </>
      ) : (
        <div className="confirm">
          <p><Undo2 size={15} style={{ verticalAlign: -2 }} /> You’re opening a return of <b>{chosen.length} {chosen.length === 1 ? 'piece' : 'pieces'}</b> from order <b>#{orderNo(order)}</b>{chosen.some(u => u.serial) ? <> ({chosen.filter(u => u.serial).map(u => u.serial).join(', ')})</> : null}.</p>
          <p>The order moves to <b>In return</b>. {full ? 'This is everything on the order, so closing the return cancels it.' : 'It’s part of the order, so closing the return puts the order back where it is now.'}</p>
          <p>{hasLabel ? <>It starts at <b>Label created</b> ({label.carrier} {label.number}).</> : <>It starts at <b>Return started</b>. Add the label when it’s made.</>}</p>
          {notify && email
            ? <div className="notice notice--warn"><Mail size={15} /> This emails <b>{email}</b> straight away: {hasLabel ? '“Your return label is ready”, with the label.' : '“Your return has started”.'}</div>
            : <div className="notice notice--ok">No email will be sent to the customer.</div>}
        </div>
      )}
    </Drawer>
  );
}
