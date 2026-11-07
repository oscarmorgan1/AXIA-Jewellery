import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Search, Undo2 } from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useReturnAddress, useReturns } from '../lib/data';
import { RETURN_LABEL, isOpen, returnChip } from '../lib/returns';
import { SkeletonRows } from '../components/Skeleton';
import { useToast } from '../components/Toast';

type Filter = 'open' | 'requests' | 'closed' | 'all';

/** The address returns go to (`internal/returns`): printed on return slips and shown to customers with their label. */
function ReturnAddress() {
  const saved = useReturnAddress();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { if (!saved.loading) setValue(saved.data); }, [saved.loading, saved.data]);
  async function save() {
    setBusy(true);
    try {
      await setDoc(doc(db, 'internal', 'returns'), { address: value.trim().slice(0, 500), updatedAt: serverTimestamp() }, { merge: true });
      toast.show('Return address saved');
    } catch (e) { toast.show((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card__head"><div><h2><MapPin size={16} style={{ verticalAlign: -2 }} /> Return address</h2><div className="card__sub">Printed on return slips, and shown to customers once their label is ready.</div></div></div>
      <textarea className="textarea" rows={4} value={value} disabled={saved.loading} onChange={e => setValue(e.target.value)} placeholder={'AXIA Jewellery Returns\nStreet address\nSuburb STATE 2000'} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn btn--primary" onClick={save} disabled={busy || saved.loading || value.trim() === saved.data.trim()}>{busy ? 'Saving…' : 'Save address'}</button>
      </div>
      {toast.node}
    </div>
  );
}

export default function Returns() {
  const { data, loading, error } = useReturns();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const nav = useNavigate();
  const counts = {
    open: data.filter(isOpen).length,
    requests: data.filter(r => r.status === 'requested').length,
    closed: data.filter(r => !isOpen(r)).length,
    all: data.length,
  };
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.filter(r => {
      if (filter === 'open' && !isOpen(r)) return false;
      if (filter === 'requests' && r.status !== 'requested') return false;
      if (filter === 'closed' && isOpen(r)) return false;
      return !s || JSON.stringify([r.number, r.orderNumber, r.customer, r.items.map(i => [i.serial, i.productName]), r.label?.number]).toLowerCase().includes(s);
    });
  }, [data, q, filter]);

  return (
    <>
      <div className="page-head"><h1>Returns</h1></div>
      <div className="card">
        <div className="card__head">
          <div className="segmented">
            {([['open', 'Open'], ['requests', 'Requests'], ['closed', 'Finished'], ['all', 'All']] as [Filter, string][]).map(([k, l]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l} <span style={{ opacity: .55 }}>{counts[k]}</span></button>
            ))}
          </div>
          <span className="spacer" />
          <div className="search"><Search size={16} /><input aria-label="Search returns" placeholder="Search returns, serials, customers" value={q} onChange={e => setQ(e.target.value)} /></div>
        </div>
        {error && <div className="notice notice--error">{error.message}</div>}
        {loading ? <SkeletonRows rows={4} cols={5} /> : !shown.length ? (
          <div className="empty"><Undo2 size={26} /><b>No returns here</b>Start one from a shipped order (Actions, Start a return). Customers can also ask from their account.</div>
        ) : (
          <div className="table-wrap fade-in">
            <table className="table">
              <thead><tr><th>Return</th><th>Started</th><th>Customer</th><th>Pieces</th><th>Status</th></tr></thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.id} className="clickable" onClick={() => nav(`/returns/${encodeURIComponent(r.id)}`)}>
                    <td>{r.number}<br /><small className="muted">Order #{r.orderNumber}</small></td>
                    <td>{r.createdAt ? r.createdAt.toDate().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'}</td>
                    <td>{r.customer.name || r.customer.email}{r.source === 'portal' && <span className="chip chip--muted chip--plain" style={{ marginLeft: 6 }}>Portal</span>}</td>
                    <td>{r.items.map(i => i.productName).join(', ')}<br /><small className="muted mono">{r.items.map(i => i.serial).filter(Boolean).join(', ')}</small></td>
                    <td><span className={`chip ${returnChip(r.status)}`}>{r.status === 'closed' && r.full ? 'Cancelled' : RETURN_LABEL[r.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ReturnAddress />
    </>
  );
}
