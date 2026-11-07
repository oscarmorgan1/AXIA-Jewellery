import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Search, Shuffle } from 'lucide-react';
import Drawer from './Drawer';
import { useProducts, useSuppliers } from '../lib/data';
import { STATE_CHIP, STATE_LABEL, colourOptions, newSerial, productGroups, sizeOptions, createPiece, draftError, dueOn, isMaking, linkPiece, markReceived, pieceState, serialKey, shortDate, today, updatePiece, type PieceDraft } from '../lib/pieces';
import type { Order, OrderItem, Piece } from '../types';

const variantOf = (i?: OrderItem) => i ? [i.width, i.length, i.colour].filter(Boolean).join(' · ') || i.options || '' : '';

/** Fields for one piece: product, serial, variant, supplier and dates. */
function PieceFields({ draft, set, existing, lockSerial }: {
  draft: PieceDraft; set: (p: Partial<PieceDraft>) => void; existing: Set<string>; lockSerial?: boolean;
}) {
  const { data: products } = useProducts();
  const { data: suppliers } = useSuppliers();
  const making = !draft.receivedOn;
  const taken = !lockSerial && existing.has(serialKey(draft.serial));
  const groups = useMemo(() => productGroups(products.filter(p => !p.archived || p.id === draft.productId)), [products, draft.productId]);
  const group = groups.find(g => g.docs.some(p => p.id === draft.productId)) || groups.find(g => g.name === draft.productName);
  const sizes = group ? sizeOptions(group.docs) : [];
  const colours = group ? colourOptions(group.docs) : [];
  return (
    <div className="form-grid">
      <label className="field full">Product
        <select className="select" value={group?.name || ''} onChange={e => {
          const g = groups.find(x => x.name === e.target.value);
          const first = g ? sizeOptions(g.docs)[0] : undefined;
          set({ productId: first?.productId || g?.docs[0]?.id || '', productName: g?.name || '', size: first?.label || '', colour: g ? colourOptions(g.docs)[0] || '' : '' });
        }}>
          <option value="">Pick a product…</option>
          {groups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
        </select>
      </label>
      <label className="field">Size
        <select className="select" value={draft.size} disabled={!group} onChange={e => {
          const o = sizes.find(x => x.label === e.target.value);
          set({ size: e.target.value, ...(o ? { productId: o.productId } : {}) });
        }}>
          {!sizes.length && <option value="">One size</option>}
          {draft.size && !sizes.some(o => o.label === draft.size) && <option value={draft.size}>{draft.size}</option>}
          {sizes.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
        </select>
      </label>
      <label className="field">Colour
        <select className="select" value={draft.colour} disabled={!group} onChange={e => set({ colour: e.target.value })}>
          {!colours.length && <option value="">One colour</option>}
          {draft.colour && !colours.includes(draft.colour) && <option value={draft.colour}>{draft.colour}</option>}
          {colours.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <div className="field full">
        <label htmlFor="pieceSerial">Serial number</label>
        <div className="serial-field">
          <input id="pieceSerial" className="input mono" value={draft.serial} disabled={lockSerial} autoCapitalize="characters" spellCheck={false} maxLength={40}
            placeholder="As printed on the authenticity card" onChange={e => set({ serial: e.target.value.toUpperCase() })} />
          {!lockSerial && <button type="button" className="btn" onClick={() => set({ serial: newSerial(existing) })}><Shuffle size={15} /> Generate</button>}
        </div>
        {taken && <small className="field__err">This serial is already in the registry.</small>}
      </div>
      <label className="field">Supplier
        <select className="select" value={draft.supplierId} onChange={e => {
          const x = suppliers.find(v => v.id === e.target.value);
          set({ supplierId: e.target.value, supplier: x ? x.name : '' });
        }}>
          <option value="">{draft.supplier && !draft.supplierId ? draft.supplier : 'None'}</option>
          {suppliers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        {!suppliers.length && <small className="muted">Add suppliers on the <Link to="/suppliers">Suppliers</Link> page.</small>}
      </label>
      <label className="field">Supplier order no.
        <input className="input" value={draft.supplierOrderNo} placeholder="Their order or invoice number" onChange={e => set({ supplierOrderNo: e.target.value })} />
      </label>
      <label className="field">Ordered from supplier
        <input className="input" type="date" value={draft.purchasedOn} max={today()} onChange={e => set({ purchasedOn: e.target.value })} />
      </label>
      <div className="field">
        <label htmlFor="pieceReceived">Received</label>
        <input id="pieceReceived" className="input" type="date" value={draft.receivedOn} max={today()} disabled={making} onChange={e => set({ receivedOn: e.target.value })} />
        <label className="check"><input type="checkbox" checked={making} onChange={e => set({ receivedOn: e.target.checked ? '' : today() })} /> Still being made</label>
      </div>
      <label className="field">Shipped date
        <input className="input" type="date" value={draft.shippedOn} onChange={e => set({ shippedOn: e.target.value })} />
        <small className="muted">Filled in when its order is marked shipped.</small>
      </label>
      <label className="field full">Notes
        <textarea className="textarea" value={draft.notes} placeholder="Private, only seen here" onChange={e => set({ notes: e.target.value })} />
      </label>
      <p className="card__sub full">Once it’s in a paid order, anyone who searches this serial on /genuine sees only the product and the date the customer bought it.</p>
    </div>
  );
}

const blank = (item?: OrderItem): PieceDraft => ({
  serial: '', productId: item?.id || '', productName: item?.name || '',
  size: item ? [item.width, item.length].filter(Boolean).join(' · ') : '', colour: item?.colour || '',
  supplierId: '', supplier: '', supplierOrderNo: '', purchasedOn: today(),
  // a piece added from an order is usually being made for it; one added to stock has usually arrived
  receivedOn: item ? '' : today(), shippedOn: '', notes: '',
});

type Owner = { email: string; via: 'order' | 'transfer'; at?: { toDate(): Date } | null };
const tsDate = (at?: { toDate(): Date } | null) => at ? at.toDate().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/**
 * Everything that has happened to a piece, oldest first: made, each order it went out
 * on, who owned it (transfers), each return and what replaced it, and where it is now.
 * Built from the piece itself (`returns`, `owners`, `replaces`), so nothing is stored twice.
 */
function PieceHistory({ piece, pieces }: { piece: Piece; pieces: Piece[] }) {
  const serial = (key?: string | null) => (key && pieces.find(p => p.key === key)?.serial) || key || 'a piece';
  const ev: { when: string; body: ReactNode; tone?: 'muted' | 'warn' }[] = [];
  const owners = (list: Owner[] | undefined) => (list || []).forEach(o => ev.push({
    when: tsDate(o.at),
    body: o.via === 'order' ? <>Bought by <Link to={`/customers/${encodeURIComponent(o.email)}`}>{o.email}</Link></> : <>Transferred to <Link to={`/customers/${encodeURIComponent(o.email)}`}>{o.email}</Link></>,
  }));
  const sent = (orderId: string, orderNumber: string, shippedOn: string | null | undefined, wasFor: string | null | undefined, retId?: string | null) => ev.push({
    when: shortDate(shippedOn) === '–' ? '' : shortDate(shippedOn),
    body: wasFor || retId
      ? <>Sent on order <Link to={`/orders/${encodeURIComponent(orderId)}`}>#{orderNumber}</Link> as the replacement for <b className="mono">{serial(wasFor)}</b>{retId ? <> (<Link to={`/returns/${encodeURIComponent(retId)}`}>exchange</Link>)</> : null}</>
      : <>{shippedOn ? 'Sent' : 'Assigned'} on order <Link to={`/orders/${encodeURIComponent(orderId)}`}>#{orderNumber}</Link></>,
  });

  ev.push({ when: shortDate(piece.purchasedOn), body: <>Ordered from {piece.supplier || 'the maker'}{piece.supplierOrderNo ? ` (No. ${piece.supplierOrderNo})` : ''}</> });
  if (piece.receivedOn) ev.push({ when: shortDate(piece.receivedOn), body: 'Received from the maker' });
  for (const r of piece.returns || []) {
    sent(r.orderId, r.orderNumber, r.shippedOn, r.wasReplacementFor, null);
    owners(r.owners);
    const by = pieces.find(p => p.replaces === piece.key && (p.replacesReturnId === r.returnId || p.returns?.some(x => x.wasReplacementFor === piece.key)));
    ev.push({ when: shortDate(r.on), body: <>Returned in <Link to={`/returns/${encodeURIComponent(r.returnId)}`}>{r.number}</Link>
      {r.outcome === 'exchange' ? <> for an exchange{by ? <>, replaced by <b className="mono">{by.serial}</b></> : null}</> : r.outcome === 'refund' ? ' for a refund' : null}. Back in stock.</> });
  }
  if (piece.orderId) {
    sent(piece.orderId, piece.orderNumber || '', piece.shippedOn, piece.replaces, piece.replacesReturnId);
    owners(piece.owners);
  }
  if (piece.transfer) ev.push({ when: '', tone: 'muted', body: <>Transfer to {piece.transfer.toEmail} waiting for them to accept{piece.transfer.expiresAt ? `, until ${tsDate(piece.transfer.expiresAt)}` : ''}</> });
  if (piece.returnId) ev.push({ when: '', tone: 'warn', body: <>In a <Link to={`/returns/${encodeURIComponent(piece.returnId)}`}>return</Link> now</> });

  return (
    <div className="field">Piece history
      <ol className="timeline timeline--compact">
        {ev.map((e, i) => <li key={i} className={e.tone ? `is-${e.tone}` : undefined}><span>{e.body}</span>{e.when && <small>{e.when}</small>}</li>)}
      </ol>
      <small className="muted">/genuine never shows who owns a piece or its history.</small>
    </div>
  );
}

/** Add a piece to the registry, or edit one. */
export function PieceDrawer({ piece, pieces, onClose, onDone }: {
  piece?: Piece; pieces: Piece[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<PieceDraft>(piece ? {
    serial: piece.serial, productId: piece.productId, productName: piece.productName,
    size: piece.size ?? piece.variant ?? '', colour: piece.colour || '',
    supplierId: piece.supplierId || '', supplier: piece.supplier || '', supplierOrderNo: piece.supplierOrderNo || '',
    purchasedOn: piece.purchasedOn || '', receivedOn: piece.receivedOn === undefined ? (piece.purchasedOn || today()) : piece.receivedOn || '',
    shippedOn: piece.shippedOn || '', notes: piece.notes || '',
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
  const { byId: suppliers } = useSuppliers();
  const due = piece && dueOn(piece, piece.supplierId ? suppliers.get(piece.supplierId)?.leadDays : null);

  async function received() {
    if (!piece) return;
    setBusy(true);
    try { await markReceived(piece.key); onDone(`${piece.serial} marked received`); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
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
      {piece && <PieceHistory piece={piece} pieces={pieces} />}
      {piece && isMaking(piece) && (
        <div className="piece-link">
          <span className="chip chip--warn">With maker</span>
          <span>Ordered {shortDate(piece.purchasedOn)}{piece.supplier ? ` from ${piece.supplier}` : ''}{due ? `, due about ${shortDate(due)}` : ''}</span>
          <button className="btn btn--sm" onClick={received} disabled={busy}>Mark received</button>
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
                <small>{isMaking(p) ? <span className="chip chip--warn chip--plain">With maker</span> : `Received ${shortDate(p.receivedOn || p.purchasedOn)}`}</small>
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
