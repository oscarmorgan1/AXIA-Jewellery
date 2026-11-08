import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { usePieces, useSuppliers } from '../lib/data';
import { isMaking } from '../lib/pieces';
import Drawer from '../components/Drawer';
import ConfirmDelete from '../components/ConfirmDelete';
import { adminApi } from '../lib/api';
import { useToast } from '../components/Toast';
import { SkeletonRows } from '../components/Skeleton';
import type { Supplier } from '../types';

type Draft = { name: string; contact: string; email: string; phone: string; leadDays: string; notes: string };

function SupplierDrawer({ supplier, pieces = 0, onClose, onDone }: { supplier?: Supplier; pieces?: number; onClose: () => void; onDone: (m: string) => void }) {
  const [d, setD] = useState<Draft>({
    name: supplier?.name || '', contact: supplier?.contact || '', email: supplier?.email || '', phone: supplier?.phone || '',
    leadDays: supplier?.leadDays != null ? String(supplier.leadDays) : '', notes: supplier?.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const set = (p: Partial<Draft>) => setD(x => ({ ...x, ...p }));

  async function save() {
    const name = d.name.trim();
    if (!name) return setError('Add the supplier’s name.');
    const lead = d.leadDays.trim() ? Math.round(Number(d.leadDays)) : null;
    if (lead != null && !(lead >= 0 && lead <= 365)) return setError('Lead time is a number of days, 0 to 365.');
    setBusy(true); setError('');
    const data = { name, contact: d.contact.trim(), email: d.email.trim(), phone: d.phone.trim(), leadDays: lead, notes: d.notes.trim(), updatedAt: serverTimestamp() };
    try {
      if (supplier) await updateDoc(doc(db, 'suppliers', supplier.id), data);
      else await addDoc(collection(db, 'suppliers'), { ...data, createdAt: serverTimestamp() });
      onDone(supplier ? `Saved ${name}` : `Added ${name}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <Drawer title={supplier ? supplier.name : 'Add a supplier'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      {supplier && <button className="btn btn--danger" onClick={() => setDeleting(true)} disabled={pieces > 0 || busy}
        title={pieces > 0 ? `${pieces} registry ${pieces === 1 ? 'piece names' : 'pieces name'} this supplier` : undefined}><Trash2 size={15} /> Delete</button>}
      <span className="spacer" style={{ flex: 1 }} />
      <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : supplier ? 'Save' : 'Add supplier'}</button>
    </>}>
      {error && <div className="notice notice--error">{error}</div>}
      <div className="form-grid">
        <label className="field full">Name<input className="input" value={d.name} autoFocus onChange={e => set({ name: e.target.value })} /></label>
        <label className="field">Contact person<input className="input" value={d.contact} onChange={e => set({ contact: e.target.value })} /></label>
        <label className="field">Usual lead time (days)<input className="input" inputMode="numeric" value={d.leadDays} placeholder="e.g. 21" onChange={e => set({ leadDays: e.target.value })} /></label>
        <label className="field">Email<input className="input" type="email" value={d.email} onChange={e => set({ email: e.target.value })} /></label>
        <label className="field">Phone / WhatsApp<input className="input" value={d.phone} onChange={e => set({ phone: e.target.value })} /></label>
        <label className="field full">Notes<textarea className="textarea" value={d.notes} placeholder="Payment terms, materials, anything worth remembering" onChange={e => set({ notes: e.target.value })} /></label>
      </div>
      {supplier && pieces > 0 && (
        <p className="card__sub" style={{ marginTop: 16 }}>
          This supplier can’t be deleted while {pieces === 1 ? '1 piece' : `${pieces} pieces`} in the registry came from them.
          {' '}<Link to={`/pieces?supplier=${encodeURIComponent(supplier.id)}`}>See those pieces</Link> and change their supplier first.
        </p>
      )}
      {deleting && supplier && (
        <ConfirmDelete title={`Delete ${supplier.name}?`} action="Delete supplier" onClose={() => setDeleting(false)}
          onConfirm={async () => { await adminApi(`/suppliers/${encodeURIComponent(supplier.id)}/delete`, {}); onDone(`Deleted ${supplier.name}`); }}>
          <p>Their contact details, lead time and notes are removed. No pieces name them, so nothing else changes. This can’t be undone.</p>
        </ConfirmDelete>
      )}
    </Drawer>
  );
}

/** Manufacturers and suppliers, with what each one is making right now. */
export default function Suppliers() {
  const { data: suppliers, loading, error } = useSuppliers();
  const { data: pieces } = usePieces();
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const toast = useToast();
  const counts = useMemo(() => {
    const m = new Map<string, { making: number; total: number }>();
    for (const p of pieces) {
      if (!p.supplierId) continue;
      const c = m.get(p.supplierId) || { making: 0, total: 0 };
      c.total++; if (isMaking(p)) c.making++;
      m.set(p.supplierId, c);
    }
    return m;
  }, [pieces]);

  return (
    <>
      <div className="page-head">
        <h1>Suppliers</h1>
        <span className="spacer" />
        <button className="btn btn--primary" onClick={() => setEditing('new')}><Plus size={16} /> Add supplier</button>
      </div>
      <div className="card">
        {error && <div className="notice notice--error">{error.message}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Supplier</th><th>Contact</th><th className="num">Lead time</th><th className="num">Being made</th><th className="num">Pieces</th></tr></thead>
            <tbody className={loading ? undefined : 'fade-in'}>
              {suppliers.map(s => {
                const c = counts.get(s.id);
                return (
                  <tr key={s.id} className="clickable" onClick={() => setEditing(s)}>
                    <td>{s.name}{s.notes ? <small className="muted" style={{ display: 'block' }}>{s.notes.slice(0, 80)}</small> : null}</td>
                    <td>{[s.contact, s.email, s.phone].filter(Boolean).join(' · ') || '–'}</td>
                    <td className="num">{s.leadDays != null ? `${s.leadDays} days` : '–'}</td>
                    <td className="num">{c?.making ? <Link to={`/pieces?state=making&supplier=${encodeURIComponent(s.id)}`} onClick={e => e.stopPropagation()}><span className="chip chip--warn">{c.making}</span></Link> : '–'}</td>
                    <td className="num">{c?.total || '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && !suppliers.length && <div className="empty"><b>No suppliers yet</b>Add your manufacturers here, then pick them when you add a piece.</div>}
          {loading && <SkeletonRows rows={4} cols={4} />}
        </div>
      </div>
      {editing && <SupplierDrawer supplier={editing === 'new' ? undefined : editing} pieces={editing === 'new' ? 0 : counts.get(editing.id)?.total || 0} onClose={() => setEditing(null)} onDone={m => { setEditing(null); toast.show(m); }} />}
      {toast.node}
    </>
  );
}
