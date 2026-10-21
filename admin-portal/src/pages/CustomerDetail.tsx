import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, MessageSquare, Phone, Save, Send, Trash2, UserPlus } from 'lucide-react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { adminApi } from '../lib/api';
import { aud } from '../lib/format';
import { usePeople } from '../lib/customers';
import { useToast } from '../components/Toast';
import ComposeEmail from '../components/ComposeEmail';
import { OrdersTable } from './Orders';
import { SOURCE, fmtDate, initials } from './Customers';

export default function CustomerDetail() {
  const { id = '' } = useParams();
  const email = decodeURIComponent(id).toLowerCase();
  const { people, loading, reload } = usePeople();
  const p = people.find(x => x.id === email);
  const [notes, setNotes] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [composing, setComposing] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  useEffect(() => { if (p && notes === null && p.record) setNotes(p.notes); }, [p, notes]);

  // What they buy: pieces across their paid orders.
  const pieces = useMemo(() => {
    const m = new Map<string, { name: string; id: string; qty: number }>();
    for (const o of p?.sales || []) for (const i of o.items || []) {
      const k = i.id || i.name;
      const v = m.get(k) || { name: i.name, id: i.id, qty: 0 };
      v.qty += i.qty || 1;
      m.set(k, v);
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty);
  }, [p]);

  const sent = [...(p?.record?.emails || [])].filter(e => e.type === 'message' || e.type === 'reply' || e.type === 'welcome').reverse();

  if (loading) return <div className="card empty">Loading…</div>;
  if (!p) return <div className="card empty"><b>Customer not found</b><Link className="btn" to="/customers">Back to customers</Link></div>;

  async function saveNotes() {
    setSaving(true);
    try {
      await adminApi(`/customers/${encodeURIComponent(p!.id)}/notes`, { notes: notes || '' });
      toast.show('Notes saved'); reload();
    } catch (e) { toast.show((e as Error).message); } finally { setSaving(false); }
  }

  async function removeSignups() {
    if (!confirm(`Delete ${p!.name || p!.email}’s ${p!.signups.length} waitlist sign-ups? Use this for privacy requests. Orders are kept, as they’re financial records. It can’t be undone.`)) return;
    const b = writeBatch(db);
    p!.signups.forEach(e => b.delete(doc(db, 'signups', e.id)));
    try { await b.commit(); } catch (e) { return toast.show(`Couldn’t delete: ${(e as Error).message}`); }
    toast.show('Sign-ups deleted');
    if (!p!.orders.length) nav('/customers');
  }

  const avg = p.sales.length ? p.spentAUD / p.sales.length : 0;
  const a = p.address;

  return (
    <>
      <div className="page-head">
        <Link to="/customers" className="icon-btn" aria-label="Back"><ArrowLeft size={18} /></Link>
        <span className="avatar" style={{ width: 44, height: 44, fontSize: 16 }}>{initials(p.name || p.email)}</span>
        <h1>{p.name || p.email}</h1>
        {p.sales.length ? <span className="chip chip--good">Customer</span> : <span className="chip chip--ice">Waitlist</span>}
        {p.sales.length > 1 && <span className="chip chip--plain chip--muted">Repeat</span>}
        {p.unsubscribedAt && <span className="chip chip--plain chip--muted" title="They used the unsubscribe link. Order emails and your replies still reach them.">Unsubscribed</span>}
        <span className="spacer" />
        {p.phone && <a className="btn" href={`tel:${p.phone}`}><Phone size={16} /> Call</a>}
        <button className="btn btn--primary" onClick={() => setComposing(true)}><Mail size={16} /> Message</button>
      </div>
      <p className="card__sub" style={{ marginTop: -8 }}>First seen {fmtDate(p.first)} · last seen {fmtDate(p.last)}</p>

      <div className="grid-4" style={{ marginBottom: 20 }}>
        <div className="card stat"><div><div className="stat__label">Orders</div><div className="stat__value">{p.sales.length}</div></div></div>
        <div className="card stat"><div><div className="stat__label">Total spent</div><div className="stat__value">{aud(p.spentAUD, 2)}</div></div></div>
        <div className="card stat"><div><div className="stat__label">Average order</div><div className="stat__value">{avg ? aud(avg, 2) : '–'}</div></div></div>
        <div className="card stat"><div><div className="stat__label">Open orders</div><div className="stat__value">{p.open.length}</div></div></div>
      </div>

      <div className="editor">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          {p.open.length > 0 && (
            <div className="card">
              <div className="card__head"><div><h2>Open orders</h2><div className="card__sub">New, in progress or shipped, not yet delivered.</div></div></div>
              <OrdersTable orders={p.open} empty="" />
            </div>
          )}
          <div className="card">
            <div className="card__head"><h2>Order history</h2></div>
            <OrdersTable orders={p.orders} empty="They haven’t ordered yet." />
          </div>
          {(p.signups.length > 0 || p.messages.length > 0 || sent.length > 0) && (
            <div className="card">
              <div className="card__head"><h2>Activity</h2></div>
              <div className="feed">
                {sent.map((e, i) => (
                  <div className="feed__item" key={'s' + i} style={{ alignItems: 'flex-start' }}>
                    <span className="feed__icon stat__icon--dark"><Send size={16} /></span>
                    <div className="feed__body"><b>{e.type === 'welcome' ? 'Welcome email' : `You ${e.type === 'reply' ? 'replied' : 'wrote'}`}: {e.subject}</b>
                      <small style={{ whiteSpace: 'pre-wrap', display: 'block' }}>{(e.body || '').slice(0, 240)}</small>
                      <small style={{ display: 'block' }}>{e.sentAt ? new Date(e.sentAt).toLocaleString('en-AU') : ''}{e.by ? ` · ${e.by}` : ''} · Resend <code>{e.resendId || 'not sent'}</code></small></div>
                  </div>
                ))}
                {p.signups.map(e => (
                  <div className="feed__item" key={e.id}>
                    <span className="feed__icon stat__icon--ice"><UserPlus size={17} /></span>
                    <div className="feed__body"><b>Joined the waitlist: {[e.productName, e.size].filter(Boolean).join(' · ') || 'general interest'}</b><small>{SOURCE[e.source || ''] || e.source} · {e.createdAt?.toDate().toLocaleString('en-AU') ?? ''}</small></div>
                  </div>
                ))}
                {p.messages.map(m => (
                  <Link to="/inbox" className="feed__item" key={m.id} style={{ alignItems: 'flex-start', color: 'inherit' }}>
                    <span className="feed__icon"><MessageSquare size={17} /></span>
                    <div className="feed__body"><b>Message: {m.topic}{m.order ? ` · ${m.order}` : ''}</b><small style={{ whiteSpace: 'pre-wrap' }}>{m.message.slice(0, 240)}</small></div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="editor__side">
          <div className="card">
            <div className="card__head"><h2>Contact</h2></div>
            <dl className="kv kv--left">
              <dt>Email</dt><dd><a href={`mailto:${p.email}`}>{p.email}</a></dd>
              <dt>Phone</dt><dd>{p.phone || '–'}</dd>
              <dt>Instagram</dt><dd>{p.instagram ? <a href={`https://instagram.com/${p.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">{p.instagram}</a> : '–'}</dd>
              <dt>Email OK</dt><dd>{p.unsubscribedAt ? `No, unsubscribed ${fmtDate(p.unsubscribedAt)}` : p.emailConsent ? 'Yes' : p.signups.length ? 'No' : '–'}</dd>
              <dt>SMS OK</dt><dd>{p.smsConsent ? 'Yes' : p.signups.length ? 'No' : '–'}</dd>
            </dl>
            {a && <address className="address" style={{ marginTop: 14 }}>
              {a.line1}{a.line2 ? <><br />{a.line2}</> : null}<br />{[a.city, a.state, a.postal_code].filter(Boolean).join(' ')}
            </address>}
          </div>
          {pieces.length > 0 && (
            <div className="card">
              <div className="card__head"><h2>Pieces bought</h2></div>
              <dl className="kv">{pieces.map(x => <Fragment key={x.id || x.name}><dt>{x.id ? <Link to={`/products/${encodeURIComponent(x.id)}`}>{x.name}</Link> : x.name}</dt><dd>× {x.qty}</dd></Fragment>)}</dl>
              {p.promoCodes.length > 0 && <div className="card__sub" style={{ marginTop: 12 }}>Codes used: {p.promoCodes.join(', ')}</div>}
            </div>
          )}
          {p.record && (
            <div className="card">
              <div className="card__head"><h2>Notes</h2></div>
              <textarea className="textarea" value={notes ?? ''} placeholder="Private notes, e.g. ring size, preferences" onChange={e => setNotes(e.target.value)} />
              <button className="btn btn--sm" style={{ marginTop: 10 }} onClick={saveNotes} disabled={saving || notes === p.notes}><Save size={14} /> {saving ? 'Saving…' : 'Save notes'}</button>
            </div>
          )}
          {p.signups.length > 0 && (
            <button className="btn btn--danger" onClick={removeSignups}><Trash2 size={15} /> Delete waitlist sign-ups</button>
          )}
        </div>
      </div>
      {composing && <ComposeEmail target={{ to: p.email, name: p.name }} onClose={() => setComposing(false)} onSent={m => { setComposing(false); toast.show(m); reload(); }} />}
      {toast.node}
    </>
  );
}
