import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { usePieces } from '../lib/data';
import { STATE_CHIP, STATE_LABEL, pieceState, serialKey, shortDate, type PieceState } from '../lib/pieces';
import { PieceDrawer } from '../components/PieceDrawer';
import { useToast } from '../components/Toast';
import { SkeletonRows } from '../components/Skeleton';
import type { Piece } from '../types';

type Filter = 'all' | PieceState;

/** Every physical piece: its serial, product, supplier purchase date, and the order it went out in. */
export default function Pieces() {
  const { data: pieces, loading, error } = usePieces();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Piece | 'new' | null>(null);
  const toast = useToast();
  const q = params.get('q') || '';

  const shown = useMemo(() => {
    const k = serialKey(q), t = q.trim().toLowerCase();
    return pieces.filter(p => {
      if (filter !== 'all' && pieceState(p) !== filter) return false;
      if (!t) return true;
      return (k && p.key.includes(k)) || `${p.productName} ${p.productId} ${p.variant || ''} ${p.supplier || ''} ${p.orderNumber || ''}`.toLowerCase().includes(t);
    });
  }, [pieces, filter, q]);
  const count = (f: Filter) => f === 'all' ? pieces.length : pieces.filter(p => pieceState(p) === f).length;

  return (
    <>
      <div className="page-head">
        <h1>Pieces</h1>
        <span className="spacer" />
        <button className="btn btn--primary" onClick={() => setEditing('new')}><Plus size={16} /> Add piece</button>
      </div>
      <p className="card__sub" style={{ marginTop: -8 }}>Each physical piece and its serial. A serial searched on /genuine shows only the product and the purchase date.</p>
      <div className="card">
        <div className="card__head">
          <div className="segmented">
            {([['all', 'All'], ['stock', 'In stock'], ['assigned', 'Assigned'], ['shipped', 'Shipped']] as [Filter, string][]).map(([k, l]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l} <span style={{ opacity: .55 }}>{count(k)}</span></button>
            ))}
          </div>
          <span className="spacer" />
          <div className="search"><Search size={16} />
            <input aria-label="Search pieces" placeholder="Serial, product or order" value={q} onChange={e => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })} />
          </div>
        </div>
        {error && <div className="notice notice--error">{error.message}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Serial</th><th>Product</th><th>Supplier</th><th>Purchased</th><th>Status</th><th>Order</th><th>Shipped</th></tr></thead>
            <tbody className={loading ? undefined : 'fade-in'}>
              {shown.map(p => {
                const st = pieceState(p);
                return (
                  <tr key={p.key} className="clickable" onClick={() => setEditing(p)}>
                    <td className="mono">{p.serial}</td>
                    <td>{p.productName}{p.variant ? <small className="muted" style={{ display: 'block' }}>{p.variant}</small> : null}</td>
                    <td>{p.supplier || '–'}</td>
                    <td>{shortDate(p.purchasedOn)}</td>
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
            : <div className="empty"><b>No pieces yet</b>Add each piece as it arrives from the supplier, then assign it from the order.</div>)}
          {loading && <SkeletonRows rows={6} cols={5} />}
        </div>
      </div>
      {editing && <PieceDrawer piece={editing === 'new' ? undefined : editing} pieces={pieces} onClose={() => setEditing(null)}
        onDone={m => { setEditing(null); toast.show(m); }} />}
      {toast.node}
    </>
  );
}
