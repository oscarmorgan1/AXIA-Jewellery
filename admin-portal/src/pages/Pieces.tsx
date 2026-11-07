import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { usePieces, useSuppliers } from '../lib/data';
import { STATE_CHIP, STATE_LABEL, dueOn, isMaking, pieceState, serialKey, shortDate, type PieceState } from '../lib/pieces';
import { PieceDrawer } from '../components/PieceDrawer';
import { useToast } from '../components/Toast';
import { SkeletonRows } from '../components/Skeleton';
import type { Piece } from '../types';

type Filter = 'all' | PieceState;

/** Every physical piece: its serial, product, supplier purchase date, and the order it went out in. */
export default function Pieces() {
  const { data: pieces, loading, error } = usePieces();
  const { data: suppliers, byId: supplierById } = useSuppliers();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>((params.get('state') as Filter) || 'all');
  const [supplier, setSupplier] = useState(params.get('supplier') || '');
  const [editing, setEditing] = useState<Piece | 'new' | null>(null);
  const toast = useToast();
  const q = params.get('q') || '';

  const shown = useMemo(() => {
    const k = serialKey(q), t = q.trim().toLowerCase();
    return pieces.filter(p => {
      if (filter !== 'all' && pieceState(p) !== filter) return false;
      if (supplier && p.supplierId !== supplier) return false;
      if (!t) return true;
      return (k && p.key.includes(k)) || `${p.productName} ${p.productId} ${p.variant || ''} ${p.supplier || ''} ${p.supplierOrderNo || ''} ${p.orderNumber || ''}`.toLowerCase().includes(t);
    });
  }, [pieces, filter, supplier, q]);
  const count = (f: Filter) => f === 'all' ? pieces.length : pieces.filter(p => pieceState(p) === f).length;

  return (
    <>
      <div className="page-head">
        <h1>Pieces</h1>
        <span className="spacer" />
        <button className="btn btn--primary" onClick={() => setEditing('new')}><Plus size={16} /> Add piece</button>
      </div>
      <p className="card__sub" style={{ marginTop: -8 }}>Each physical piece and its serial, from ordering with the maker to shipping. A serial searched on /genuine shows only the product and the purchase date.</p>
      <div className="card">
        <div className="card__head">
          <div className="segmented">
            {([['all', 'All'], ['making', 'With maker'], ['stock', 'In stock'], ['assigned', 'Ready for order'], ['shipped', 'Shipped']] as [Filter, string][]).map(([k, l]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l} <span style={{ opacity: .55 }}>{count(k)}</span></button>
            ))}
          </div>
          {suppliers.length > 0 && (
            <select className="select" style={{ width: 170, borderRadius: 999 }} value={supplier} onChange={e => setSupplier(e.target.value)} aria-label="Supplier">
              <option value="">All suppliers</option>
              {suppliers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          <span className="spacer" />
          <div className="search"><Search size={16} />
            <input aria-label="Search pieces" placeholder="Serial, product or order" value={q} onChange={e => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })} />
          </div>
        </div>
        {error && <div className="notice notice--error">{error.message}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Serial</th><th>Product</th><th>Supplier</th><th>Ordered</th><th>Received</th><th>Status</th><th>Order</th><th>Shipped</th></tr></thead>
            <tbody className={loading ? undefined : 'fade-in'}>
              {shown.map(p => {
                const st = pieceState(p);
                return (
                  <tr key={p.key} className="clickable" onClick={() => setEditing(p)}>
                    <td className="mono">{p.serial}</td>
                    <td>{p.productName}{p.variant ? <small className="muted" style={{ display: 'block' }}>{p.variant}</small> : null}</td>
                    <td>{p.supplier || '–'}{p.supplierOrderNo ? <small className="muted" style={{ display: 'block' }}>No. {p.supplierOrderNo}</small> : null}</td>
                    <td>{shortDate(p.purchasedOn)}</td>
                    <td>{isMaking(p) ? (() => { const due = dueOn(p, p.supplierId ? supplierById.get(p.supplierId)?.leadDays : null); return <span className="muted">{due ? `Due ${shortDate(due)}` : 'Not yet'}</span>; })() : shortDate(p.receivedOn ?? p.purchasedOn)}</td>
                    <td><span className={`chip ${STATE_CHIP[st]}`}>{STATE_LABEL[st]}</span></td>
                    <td>{p.orderId ? <Link to={`/orders/${encodeURIComponent(p.orderId)}`} onClick={e => e.stopPropagation()}>#{p.orderNumber}</Link> : '–'}</td>
                    <td>{shortDate(p.shippedOn)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && !shown.length && (pieces.length
            ? <div className="empty"><b>No pieces match</b>Try a different filter or search.</div>
            : <div className="empty"><b>No pieces yet</b>Add each piece when you order it from the maker, then assign it from the order.</div>)}
          {loading && <SkeletonRows rows={6} cols={5} />}
        </div>
      </div>
      {editing && <PieceDrawer piece={editing === 'new' ? undefined : editing} pieces={pieces} onClose={() => setEditing(null)}
        onDone={m => { setEditing(null); toast.show(m); }} />}
      {toast.node}
    </>
  );
}
