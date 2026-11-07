import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Gem, Gift, Send, X } from 'lucide-react';
import { siteUrl } from '../../src/firebase';
import Drawer from '../../src/components/Drawer';
import { accountApi } from '../api';
import { useIncoming, useMyPieces, ymd, type IncomingPiece, type MyPiece } from '../pieces';
import { thumb } from './Orders';

const day = (t: number | null) => (t ? new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '');
const img = (src: string) => (src ? <img src={thumb(src)} alt="" onError={e => { e.currentTarget.src = siteUrl(src); }} /> : null);

/** /portal/pieces: every piece registered to them, with its serial, and pieces on their way to them. */
export default function Pieces() {
  const { pieces, error } = useMyPieces();
  const incoming = useIncoming();
  const [params] = useSearchParams();
  const [sending, setSending] = useState<MyPiece | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState('');
  const focus = params.get('transfer');
  useEffect(() => { document.title = 'Pieces · AXIA'; }, []);

  async function act(path: string, done: string, id: string) {
    setBusy(id); setActionError(''); setNotice('');
    try { await accountApi(path); setNotice(done); } catch (e) { setActionError((e as Error).message); } finally { setBusy(''); }
  }

  return (
    <div className="page pt-page">
      <div className="page-head"><h1>Pieces</h1><p className="lede">Each AXIA piece you own, with the serial from its authenticity card. Gifting one? Transfer it to their account.</p></div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      {actionError && <div className="notice notice--error" role="alert">{actionError}</div>}
      {notice && <div className="notice notice--ok" role="status">{notice}</div>}

      {incoming && incoming.length > 0 && (
        <section className="pt-incoming" aria-label="Waiting for you">
          {incoming.map(t => <Incoming key={t.id} t={t} focus={focus === t.id} busy={busy === t.id}
            onAccept={() => act(`/transfers/${encodeURIComponent(t.id)}/accept`, `${t.productName} is now in your pieces.`, t.id)}
            onDecline={() => { if (confirm(`Decline ${t.productName}? It stays with ${t.fromName || 'the sender'}.`)) act(`/transfers/${encodeURIComponent(t.id)}/decline`, 'Transfer declined.', t.id); }} />)}
        </section>
      )}

      {pieces === null ? <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>
        : !pieces.length ? (incoming && incoming.length ? null : (
          <div className="card empty">
            <Gem size={28} />
            <b>No pieces yet</b>
            <p>Once your piece is made and checked, its serial is registered here.</p>
          </div>
        )) : (
          <div className="pt-pieces">
            {pieces.map(p => (
              <article key={p.key} className="card pt-piece">
                <div className="pt-piece__img">
                  {img(p.image)}
                  <span className="chip chip--onimg">{p.transfer ? 'Transfer pending' : p.shippedOn ? 'With you' : 'Being finished'}</span>
                </div>
                <div className="pt-piece__body">
                  <h2>{p.productName}</h2>
                  {p.variant && <small>{p.variant}</small>}
                  <dl className="kv kv--left pt-piece__kv">
                    <dt>Serial</dt><dd className="mono">{p.serial}</dd>
                    {p.purchasedOn && <><dt>Bought</dt><dd>{ymd(p.purchasedOn)}</dd></>}
                    {p.transferredOn && <><dt>Received</dt><dd>{ymd(p.transferredOn)}, transferred to you</dd></>}
                    {p.orderNumber && <><dt>Order</dt><dd>{p.orderId ? <Link to={`/orders/${encodeURIComponent(p.orderId)}`}>#{p.orderNumber}</Link> : `#${p.orderNumber}`}</dd></>}
                  </dl>
                  {p.transfer && (
                    <div className="pt-pending">
                      Waiting for <b>{p.transfer.toEmail}</b> to accept{p.transfer.expiresAt ? ` (open until ${day(p.transfer.expiresAt)})` : ''}.
                    </div>
                  )}
                  <div className="pt-piece__actions">
                    <a className="btn btn--sm" href={`/genuine?serial=${encodeURIComponent(p.serial)}`}><BadgeCheck size={15} /> Verify</a>
                    {p.transfer
                      ? <button className="btn btn--sm" disabled={busy === p.transfer.id} onClick={() => act(`/transfers/${encodeURIComponent(p.transfer!.id)}/cancel`, 'Transfer cancelled. The piece stays with you.', p.transfer!.id)}><X size={15} /> Cancel transfer</button>
                      : p.shippedOn && <button className="btn btn--sm" onClick={() => { setNotice(''); setSending(p); }}><Send size={15} /> Transfer</button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      {sending && <TransferDrawer piece={sending} onClose={() => setSending(null)} onSent={email => { setSending(null); setNotice(`Sent. ${email} has 14 days to accept, and we’ll email you either way.`); }} />}
    </div>
  );
}

function Incoming({ t, focus, busy, onAccept, onDecline }: { t: IncomingPiece; focus: boolean; busy: boolean; onAccept: () => void; onDecline: () => void }) {
  return (
    <article className={`card pt-offer${focus ? ' is-focus' : ''}`} ref={el => { if (el && focus) el.scrollIntoView({ block: 'center' }); }}>
      <div className="pt-offer__img">{img(t.image)}</div>
      <div className="pt-offer__body">
        <span className="pt-offer__kicker"><Gift size={14} /> Waiting for you</span>
        <h2>{t.productName}</h2>
        <p>{t.fromName || 'An AXIA customer'} wants to transfer this piece to you{t.variant ? ` (${t.variant})` : ''}. Serial <span className="mono">{t.serial}</span>.</p>
        {t.note && <blockquote>{t.note}</blockquote>}
        <div className="pt-piece__actions">
          <button className="btn btn--primary btn--sm" disabled={busy} onClick={onAccept}>{busy ? 'One moment…' : 'Accept'}</button>
          <button className="btn btn--sm" disabled={busy} onClick={onDecline}>Decline</button>
          {t.expiresAt && <small>Open until {day(t.expiresAt)}</small>}
        </div>
      </div>
    </article>
  );
}

function TransferDrawer({ piece, onClose, onSent }: { piece: MyPiece; onClose: () => void; onSent: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!confirming) { setConfirming(true); return; }
    setBusy(true); setError('');
    try { await accountApi(`/pieces/${encodeURIComponent(piece.key)}/transfer`, { email: email.trim(), note: note.trim() }); onSent(email.trim()); }
    catch (err) { setError((err as Error).message); setConfirming(false); }
    finally { setBusy(false); }
  }

  return (
    <Drawer title="Transfer this piece" onClose={onClose} footer={<>
      <button className="btn" onClick={confirming ? () => setConfirming(false) : onClose} disabled={busy}>{confirming ? 'Back' : 'Cancel'}</button>
      <span style={{ flex: 1 }} />
      <button className="btn btn--primary" form="pt-transfer" disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())}>
        <Send size={15} /> {busy ? 'Sending…' : confirming ? 'Send transfer' : 'Review'}
      </button>
    </>}>
      <div className="pt-offer pt-offer--flat">
        <div className="pt-offer__img">{img(piece.image)}</div>
        <div className="pt-offer__body"><h2>{piece.productName}</h2><small>{piece.variant} · <span className="mono">{piece.serial}</span></small></div>
      </div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <form id="pt-transfer" onSubmit={send} className="form-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {!confirming ? <>
          <label className="field">Their email
            <input className="input" type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" required autoFocus />
          </label>
          <label className="field">A note for them (optional)
            <textarea className="textarea" value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Happy birthday!" />
          </label>
          <p className="card__sub" style={{ margin: 0 }}>We email them to accept it. If they don’t have an AXIA account yet, the email helps them make one.</p>
        </> : (
          <div className="notice notice--warn">
            Once <b>{email.trim()}</b> accepts, this piece and its serial move to their account and leave yours. Until then you can cancel. The offer is open for 14 days.
          </div>
        )}
      </form>
    </Drawer>
  );
}
