import { useState, type FormEvent } from 'react';
import { ArrowLeftRight, Banknote, Printer, Truck, Undo2 } from 'lucide-react';
import Drawer from '../../src/components/Drawer';
import ReturnTracker from '../../src/components/ReturnTracker';
import { openBlank, returnSlipHtml, writeDocument } from '../../src/lib/documents';
import { accountApi } from '../api';
import { aud, day, type MyOrder } from '../orders';
import type { MyPiece } from '../pieces';
import { siteUrl } from '../../src/firebase';
import { thumb } from './Orders';
import { REASONS, RETURN_DAYS, statusChip, isOpenReturn, returnStep, stepsFor, type MyReturn } from '../returns';

/** What happens next, in their words, for each step. */
const NEXT: Record<string, string> = {
  requested: 'We’re checking your request and will email you a prepaid return label shortly. Please don’t send anything back until it arrives.',
  label_created: 'Your label is ready. Pack the piece in its AXIA box with its authenticity card, put the return slip inside, and send it with the label.',
  received: 'Your parcel is back with us. We’re inspecting the piece, then we’ll refund you.',
  refunded: 'We’ve refunded you to your original payment method. It usually shows within 5 to 10 business days.',
  replacement_sent: 'Your replacement is on its way, with its own authenticity card. Its serial is now in your Pieces.',
  closed: 'Your return is complete.',
  declined: 'We weren’t able to accept this return.',
  withdrawn: 'You withdrew this return request. The piece stays yours.',
};

/** One return on their order page: the tracker, the label, the slip to print, and what happens next. */
export function ReturnCard({ ret, order }: { ret: MyReturn; order: MyOrder }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const st = statusChip(ret);
  const ended = ret.status === 'declined' || ret.status === 'withdrawn';
  const when = (key: string) => { const hits = ret.timeline.filter(t => t.status === key && t.at); return hits.length ? day(hits[hits.length - 1].at) : ''; };
  const exchange = ret.outcome === 'exchange';
  const steps = stepsFor(ret).map(s => ({ label: s.key === 'closed' && !exchange && !ret.full ? 'Complete' : s.label, when: when(s.key) }));
  const next = exchange && ret.status === 'received' ? 'Your parcel is back with us. We’re checking the piece, then we’ll send your replacement.'
    : exchange && ret.status === 'closed' ? 'Your exchange is complete. Enjoy the new piece.' : NEXT[ret.status];
  const notes = ret.timeline.filter(t => t.note);

  function slip() {
    const w = openBlank('Preparing your return slip…');
    if (!w) { setError('Your browser blocked the new tab. Allow pop-ups for this site and try again.'); return; }
    const a = order.shipping.address;
    writeDocument(w, returnSlipHtml({
      number: ret.number, orderNumber: ret.orderNumber, to: ret.returnTo, reason: ret.reason, items: ret.items, label: ret.label,
      from: [order.shipping.name, a?.line1, a?.line2, a && [a.city, a.state, a.postal_code].filter(Boolean).join(' ')].filter((x): x is string => !!x),
      startedOn: ret.createdAt ? new Date(ret.createdAt) : null,
    }));
  }

  async function withdraw() {
    if (!confirm('Withdraw this return request? The piece stays with you.')) return;
    setBusy(true); setError('');
    try { await accountApi(`/returns/${encodeURIComponent(ret.id)}/withdraw`); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="card return-card">
      <div className="return-card__head">
        <Undo2 size={16} />
        <b>Return {ret.number}</b>
        <span className={`chip ${st.chip}`}>{st.label}</span>
        <span className="spacer" />
        <small className="muted">{ret.items.map(i => i.productName).join(', ')}</small>
      </div>
      <div className="pt-goal">
        {exchange ? <ArrowLeftRight size={16} /> : <Banknote size={16} />}
        <span>You asked for <b>{exchange ? 'an exchange' : 'a refund'}</b>{exchange && ret.wanted ? <>: {ret.wanted}</> : null}</span>
      </div>
      {!ended && <ReturnTracker steps={steps} at={returnStep(ret)} />}
      <p className="card__sub" style={{ margin: 0 }}>{next}{ret.refund && ret.status !== 'declined' ? ` Refund: ${aud(ret.refund.amountAUD)}.` : ''}</p>
      {ret.label && isOpenReturn(ret) && ret.status === 'label_created' && (
        <div className="pt-track" style={{ marginTop: 0 }}>
          <span><b>{ret.label.carrier || 'Return label'}</b>{ret.label.number && <> · <span className="mono">{ret.label.number}</span></>}</span>
          <span className="spacer" />
          {ret.label.url && <a className="btn btn--primary btn--sm" href={ret.label.url} target="_blank" rel="noreferrer">Get your label</a>}
          <button className="btn btn--sm" onClick={slip}><Printer size={15} /> Return slip</button>
        </div>
      )}
      {exchange && ret.replacement && ['replacement_sent', 'closed'].includes(ret.status) && (
        <div className="pt-track" style={{ marginTop: 0 }}>
          <Truck size={18} />
          <span><b>{ret.replacement.carrier || 'Replacement'}</b>{ret.replacement.number && <> · <span className="mono">{ret.replacement.number}</span></>}
            {ret.replacement.pieces.map(p => <small key={p.serial} style={{ display: 'block' }}>{p.productName}{p.variant ? ` · ${p.variant}` : ''} · serial <span className="mono">{p.serial}</span></small>)}</span>
          <span className="spacer" />
          {ret.replacement.url && <a className="btn btn--primary btn--sm" href={ret.replacement.url} target="_blank" rel="noreferrer">Track replacement</a>}
        </div>
      )}
      {notes.length > 0 && <div className="pt-notes" style={{ marginTop: 0 }}>{notes.map((n, i) => <p key={i}><small>{day(n.at)} · from AXIA</small>{n.note}</p>)}</div>}
      {ret.status === 'requested' && <div><button className="btn btn--sm" disabled={busy} onClick={withdraw}>{busy ? 'One moment…' : 'Withdraw request'}</button></div>}
      {error && <div className="notice notice--error" role="alert">{error}</div>}
    </div>
  );
}

/** Asks to return one piece: the reason and a note, with the policy up front. */
export function ReturnRequestDrawer({ piece, onClose, onDone }: { piece: MyPiece; onClose: () => void; onDone: (orderId: string) => void }) {
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<'' | 'refund' | 'exchange'>('');
  const [wanted, setWanted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const needsNote = reason === 'faulty' && note.trim().length < 4;
  const needsWanted = outcome === 'exchange' && wanted.trim().length < 2;

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await accountApi<{ orderId: string }>('/returns', { key: piece.key, outcome, wanted: outcome === 'exchange' ? wanted.trim() : '', reason, note: note.trim() });
      onDone(r.orderId);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <Drawer title="Return or exchange" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <span style={{ flex: 1 }} />
      <button className="btn btn--primary" form="pt-return" disabled={busy || !outcome || !reason || needsNote || needsWanted}><Undo2 size={15} /> {busy ? 'Sending…' : outcome === 'exchange' ? 'Request exchange' : 'Request return'}</button>
    </>}>
      <div className="pt-offer pt-offer--flat">
        <div className="pt-offer__img">{piece.image ? <img src={thumb(piece.image)} alt="" onError={e => { e.currentTarget.src = siteUrl(piece.image); }} /> : null}</div>
        <div className="pt-offer__body"><h2>{piece.productName}</h2><small>{piece.variant} · <span className="mono">{piece.serial}</span>{piece.orderNumber ? ` · order #${piece.orderNumber}` : ''}</small></div>
      </div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <form id="pt-return" onSubmit={send} className="form-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div className="field">What would you like?
          <div className="status-pick">
            <label className={`status-opt${outcome === 'exchange' ? ' on' : ''}`}>
              <input type="radio" name="outcome" checked={outcome === 'exchange'} onChange={() => setOutcome('exchange')} />
              <span><b>An exchange</b><small>Swap it for another size or piece. We send the replacement once yours is back.</small></span>
            </label>
            <label className={`status-opt${outcome === 'refund' ? ' on' : ''}`}>
              <input type="radio" name="outcome" checked={outcome === 'refund'} onChange={() => setOutcome('refund')} />
              <span><b>A refund</b><small>Money back to your original payment method once it’s back and checked.</small></span>
            </label>
          </div>
        </div>
        {outcome === 'exchange' && <label className="field">What would you like instead?
          <input className="input" value={wanted} maxLength={300} onChange={e => setWanted(e.target.value)} placeholder="e.g. the same chain in 18in" />
        </label>}
        <label className="field">Why are you returning it?
          <select className="select" value={reason} onChange={e => setReason(e.target.value)} required>
            <option value="" disabled>Choose a reason…</option>
            {REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <label className="field">{reason === 'faulty' ? 'What’s wrong with it?' : 'Anything we should know? (optional)'}
          <textarea className="textarea" value={note} maxLength={2000} onChange={e => setNote(e.target.value)} placeholder={reason === 'faulty' ? 'e.g. a stone came loose from the clasp' : ''} />
        </label>
        <div className="card__sub" style={{ margin: 0 }}>
          You have {RETURN_DAYS} days from when it shipped. Pieces need to be unworn and in their original condition with the box and authenticity card. Engraved pieces can only be returned if faulty. We’ll email you a prepaid label, and once the piece is back and checked we’ll {outcome === 'exchange' ? 'send your replacement' : outcome === 'refund' ? 'refund you' : 'refund you or send your replacement'}.
        </div>
      </form>
    </Drawer>
  );
}
