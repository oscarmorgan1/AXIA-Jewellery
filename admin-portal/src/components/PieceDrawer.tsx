import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import Drawer from './Drawer';
import { useProducts } from '../lib/data';
import { STATE_CHIP, STATE_LABEL, createPiece, draftError, linkPiece, pieceState, serialKey, shortDate, today, updatePiece, type PieceDraft } from '../lib/pieces';
import type { Order, OrderItem, Piece } from '../types';

const variantOf = (i?: OrderItem) => i ? [i.width, i.length, i.colour].filter(Boolean).join(' · ') || i.options || '' : '';

/** Fields for one piece: product, serial, variant, supplier and dates. */
function PieceFields({ draft, set, existing, lockSerial }: {
  draft: PieceDraft; set: (p: Partial<PieceDraft>) => void; existing: Set<string>; lockSerial?: boolean;
}) {
  const { data: products } = useProducts();
  const taken = !lockSerial && existing.has(serialKey(draft.serial));
  return (
    <div className="form-grid">
      <label className="field full">Product
        <select className="select" value={draft.productId} onChange={e => {
          const p = products.find(x => x.id === e.target.value);
          set({ productId: e.target.value, productName: p ? p.name + (p.width ? `, ${p.width}` : '') : '' });
        }}>
          <option value="">Pick a product…</option>
          {products.filter(p => !p.archived || p.id === draft.productId).map(p => <option key={p.id} value={p.id}>{p.name}{p.width ? `, ${p.width}` : ''}</option>)}
        </select>
      </label>
      <label className="field full">Serial number
        <input className="input mono" value={draft.serial} disabled={lockSerial} autoCapitalize="characters" spellCheck={false} maxLength={40}
          placeholder="As printed on the authenticity card" onChange={e => set({ serial: e.target.value.toUpperCase() })} />
        {taken && <small className="field__err">This serial is already in the registry.</small>}
      </label>
      <label className="field">Size / colour
        <input className="input" value={draft.variant} placeholder="e.g. 12mm · 20in · White gold" onChange={e => set({ variant: e.target.value })} />
      </label>
      <label className="field">Supplier
        <input className="input" value={draft.supplier} placeholder="Optional" onChange={e => set({ supplier: e.target.value })} />
      </label>
      <label className="field">Supplier purchase date
        <input className="input" type="date" value={draft.purchasedOn} max={today()} onChange={e => set({ purchasedOn: e.target.value })} />
      </label>
      <label className="field">Shipped date
        <input className="input" type="date" value={draft.shippedOn} onChange={e => set({ shippedOn: e.target.value })} />
        <small className="muted">Filled in when its order is marked shipped.</small>
      </label>
      <label className="field full">Notes
        <textarea className="textarea" value={draft.notes} placeholder="Private, only seen here" onChange={e => set({ notes: e.target.value })} />
      </label>
      <p className="card__sub full">Anyone who searches this serial on /genuine sees only the product and the purchase date.</p>
    </div>
  );
}

const blank = (item?: OrderItem): PieceDraft => ({
  serial: '', productId: item?.id || '', productName: item?.name || '', variant: variantOf(item),
  supplier: '', purchasedOn: today(), shippedOn: '', notes: '',
});

/** Add a piece to the registry, or edit one. */
export function PieceDrawer({ piece, pieces, onClose, onDone }: {
  piece?: Piece; pieces: Piece[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<PieceDraft>(piece ? {
    serial: piece.serial, productId: piece.productId, productName: piece.productName, variant: piece.variant || '',
    supplier: piece.supplier || '', purchasedOn: piece.purchasedOn || '', shippedOn: piece.shippedOn || '', notes: piece.notes || '',
  } : blank());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const existing = useMemo(() => new Set(pieces.map(p => p.key)), [pieces]);
  const set = (p: Partial<PieceDraft>) => setDraft(d => ({ ...d, ...p }));

  async function save() {
    const bad = draftError(draft);
    if (bad) return setError(bad);
    setBusy(true); setError('');
    try {
      if (piece) { await updatePiece(piece.key, draft); onDone(`Saved ${piece.serial}`); }
      else { await createPiece(draft); onDone(`Added ${draft.serial.trim()} to the registry`); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function unlink() {
    if (!piece) return;
    setBusy(true);
    try { await linkPiece(piece.key, null); onDone(`${piece.serial} is back in stock`); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const st = piece && pieceState(piece);
  return (
    <Drawer title={piece ? `Piece ${piece.serial}` : 'Add a piece'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <span className="spacer" style={{ flex: 1 }} />
      <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : piece ? 'Save' : 'Add piece'}</button>
    </>}>
      {error && <div className="notice notice--error">{error}</div>}
      {piece && st && (
        <div className="piece-link">
          <span className={`chip ${STATE_CHIP[st]}`}>{STATE_LABEL[st]}</span>
          {piece.orderId ? <>
            <span>Order <Link to={`/orders/${encodeURIComponent(piece.orderId)}`}>#{piece.orderNumber}</Link>{piece.shippedOn ? `, shipped ${shortDate(piece.shippedOn)}` : ''}</span>
            <button className="btn btn--sm" onClick={unlink} disabled={busy}>Unassign</button>
          </> : <span className="muted">Not tied to an order. Assign it from the order page.</span>}
        </div>
      )}
      <PieceFields draft={draft} set={set} existing={existing} lockSerial={!!piece} />
    </Drawer>
  );
}

/** From an order line: pick a piece already in the registry, or add a new one and assign it. */
export function AssignPieceDrawer({ order, line, pieces, onClose, onDone }: {
  order: Order; line: number; pieces: Piece[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const item = order.items?.[line];
  const free = useMemo(() => pieces.filter(p => !p.orderId), [pieces]);
  const sameProduct = free.filter(p => p.productId === item?.id);
  const [mode, setMode] = useState<'pick' | 'new'>(sameProduct.length ? 'pick' : 'new');
  const [q, setQ] = useState('');
  const [all, setAll] = useState(!sameProduct.length);
  const [draft, setDraft] = useState<PieceDraft>(blank(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const existing = useMemo(() => new Set(pieces.map(p => p.key)), [pieces]);
  const set = (p: Partial<PieceDraft>) => setDraft(d => ({ ...d, ...p }));

  const shown = useMemo(() => {
    const s = serialKey(q), t = q.trim().toLowerCase();
    return (all ? free : sameProduct).filter(p => !q || p.key.includes(s) || `${p.productName} ${p.variant || ''}`.toLowerCase().includes(t));
  }, [all, free, sameProduct, q]);

  async function pick(p: Piece) {
    setBusy(true); setError('');
    try { await linkPiece(p.key, { order, line }); onDone(`Assigned ${p.serial} to ${item?.name || 'this item'}`); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }

  async function add() {
    const bad = draftError(draft);
    if (bad) return setError(bad);
    setBusy(true); setError('');
    try { await createPiece(draft, { order, line }); onDone(`Added ${draft.serial.trim()} and assigned it`); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <Drawer title={`Piece for ${item?.name || 'item'}`} onClose={onClose} footer={mode === 'new' ? <>
      <button className="btn" onClick={onClose}>Cancel</button>
      <span className="spacer" style={{ flex: 1 }} />
      <button className="btn btn--primary" onClick={add} disabled={busy}>{busy ? 'Saving…' : 'Add and assign'}</button>
    </> : undefined}>
      <p className="card__sub" style={{ marginTop: 0 }}>{variantOf(item) || 'No options'}{item?.engraving ? ` · Engraving: ${item.engraving}` : ''}</p>
      <div className="segmented" style={{ alignSelf: 'flex-start' }}>
        <button className={mode === 'pick' ? 'on' : ''} onClick={() => setMode('pick')}>From the registry <span style={{ opacity: .55 }}>{free.length}</span></button>
        <button className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>Add a new piece</button>
      </div>
      {error && <div className="notice notice--error">{error}</div>}
      {mode === 'pick' ? (
        <>
          <div className="search" style={{ width: '100%' }}><Search size={16} />
            <input aria-label="Search pieces" placeholder="Search serial or product" value={q} autoFocus onChange={e => setQ(e.target.value)} />
          </div>
          <label className="check"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> Show pieces of other products</label>
          <div className="piece-pick">
            {shown.map(p => (
              <button key={p.key} className="piece-pick__row" onClick={() => pick(p)} disabled={busy}>
                <span className="mono">{p.serial}</span>
                <span>{p.productName}{p.variant ? <small>{p.variant}</small> : null}</span>
                <small>Bought {shortDate(p.purchasedOn)}</small>
              </button>
            ))}
            {!shown.length && <div className="empty"><b>No free pieces{all ? '' : ' of this product'}</b>
              {all ? 'Every piece in the registry is already assigned.' : 'Tick “Show pieces of other products”, or add a new one.'}</div>}
          </div>
        </>
      ) : <PieceFields draft={draft} set={set} existing={existing} />}
    </Drawer>
  );
}
