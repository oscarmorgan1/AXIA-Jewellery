import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CornerUpLeft, Inbox as InboxIcon, Mail, Receipt, RotateCcw, Trash2, User } from 'lucide-react';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useMessages, useOrders } from '../lib/data';
import { findOrderRefs, orderNo } from '../lib/orders';
import { aud } from '../lib/format';
import { statusChip } from './Orders';
import ComposeEmail from '../components/ComposeEmail';
import Drawer from '../components/Drawer';
import { useToast } from '../components/Toast';
import type { Message } from '../types';

type Filter = 'new' | 'done' | 'all';

export default function Inbox() {
  const { data: messages, loading, error } = useMessages();
  const [filter, setFilter] = useState<Filter>('new');
  const [openId, setOpenId] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);
  const { data: orders } = useOrders();
  const toast = useToast();

  const counts = { new: messages.filter(m => m.status !== 'done').length, done: messages.filter(m => m.status === 'done').length, all: messages.length };
  const shown = useMemo(() => messages.filter(m => filter === 'all' || (filter === 'done' ? m.status === 'done' : m.status !== 'done')), [messages, filter]);
  const open = messages.find(m => m.id === openId) || null;
  // Orders the inquiry mentions (in any format), then their other orders by email.
  const mentioned = useMemo(() => (open ? findOrderRefs([open.order, open.message], orders) : []), [open, orders]);
  const theirs = useMemo(() => (open ? orders.filter(o => (o.customer?.email || '').toLowerCase() === open.email.toLowerCase() && !mentioned.includes(o)) : []), [open, orders, mentioned]);
  const hasCustomer = !!open && (theirs.length > 0 || mentioned.some(o => (o.customer?.email || '').toLowerCase() === open.email.toLowerCase()));
  const refsFor = (m: { order?: string; message: string }) => findOrderRefs([m.order, m.message], orders);

  async function setStatus(m: Message, status: 'new' | 'done') {
    try { await updateDoc(doc(db, 'messages', m.id), { status }); } catch (e) { return toast.show(`Couldn’t save: ${(e as Error).message}`); }
    toast.show(status === 'done' ? 'Marked as done' : 'Moved back to new');
    if (status === 'done') setOpenId(null);
  }
  async function remove(m: Message) {
    if (!confirm(`Delete this message from ${m.name}?`)) return;
    try { await deleteDoc(doc(db, 'messages', m.id)); } catch (e) { return toast.show(`Couldn’t save: ${(e as Error).message}`); }
    setOpenId(null);
    toast.show('Message deleted');
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Inbox</h1><p className="lede" style={{ margin: 0 }}>Messages from the contact form on the Support page.</p></div>
        <span className="spacer" />
        <div className="segmented">
          {([['new', 'New'], ['done', 'Done'], ['all', 'All']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l} <span style={{ opacity: .55 }}>{counts[k]}</span></button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 10 }}>
        {error && <div className="notice notice--error">{error.message}</div>}
        {loading && <div style={{ display: 'grid', gap: 10, padding: 12 }}>{[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 56 }} />)}</div>}
        <div className="feed">
          {shown.map((m, i) => (
            <button key={m.id} className="feed__item" style={{ border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', animation: `rise .4s cubic-bezier(.2,.8,.2,1) ${Math.min(i, 8) * 30}ms both` }} onClick={() => setOpenId(m.id)}>
              <span className={`feed__icon ${m.status === 'done' ? '' : 'stat__icon--magenta'}`}>{m.status === 'done' ? <Check size={18} /> : <Mail size={18} />}</span>
              <div className="feed__body">
                <b>{m.name} <span className="chip chip--muted chip--plain" style={{ marginLeft: 6 }}>{m.topic}</span>
                  {refsFor(m).slice(0, 1).map(o => <span key={o.id} className="chip chip--ice chip--plain" style={{ marginLeft: 6 }}>#{orderNo(o)}</span>)}
                  {(m.replies || []).length > 0 && <span className="chip chip--good chip--plain" style={{ marginLeft: 6 }}>Replied</span>}</b>
                <small>{m.message.slice(0, 120)}</small>
              </div>
              <small style={{ color: 'var(--faint)', whiteSpace: 'nowrap' }}>{m.createdAt?.toDate().toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</small>
            </button>
          ))}
        </div>
        {!loading && !shown.length && <div className="empty"><InboxIcon size={28} /><b>{filter === 'new' ? 'All caught up' : 'Nothing here'}</b>{filter === 'new' ? 'New messages from the Support page will appear here.' : ''}</div>}
      </div>

      {open && !replying && (
        <Drawer title={open.name} onClose={() => setOpenId(null)}
          footer={<>
            <button className="btn btn--danger" onClick={() => remove(open)}><Trash2 size={15} /> Delete</button>
            <span style={{ flex: 1 }} />
            {open.status === 'done'
              ? <button className="btn" onClick={() => setStatus(open, 'new')}><RotateCcw size={15} /> Mark as new</button>
              : <button className="btn" onClick={() => setStatus(open, 'done')}><Check size={15} /> Mark done</button>}
            <button className="btn btn--primary" onClick={() => setReplying(true)}><CornerUpLeft size={15} /> Reply</button>
          </>}>
          <dl className="kv">
            <dt>From</dt><dd>{open.email}</dd>
            <dt>Topic</dt><dd>{open.topic}</dd>
            <dt>Order number given</dt><dd>{open.order || '–'}</dd>
            <dt>Received</dt><dd>{open.createdAt?.toDate().toLocaleString('en-AU') ?? '–'}</dd>
          </dl>
          {(mentioned.length > 0 || (open.order && !mentioned.length)) && (
            <div className="field">Order mentioned
              {mentioned.map(o => (
                <Link key={o.id} to={`/orders/${encodeURIComponent(o.id)}`} className="linked-order"><Receipt size={16} /><b>#{orderNo(o)}</b>{statusChip(o.status)}<span className="spacer" />{aud(o.totalAUD, 2)}</Link>
              ))}
              {!mentioned.length && <div className="notice notice--warn">No order matches “{open.order}”.</div>}
            </div>
          )}
          {theirs.length > 0 && (
            <div className="field">{mentioned.length ? 'Their other orders' : 'Their orders'}
              {theirs.slice(0, 5).map(o => (
                <Link key={o.id} to={`/orders/${encodeURIComponent(o.id)}`} className="linked-order"><Receipt size={16} /><b>#{orderNo(o)}</b>{statusChip(o.status)}<span className="spacer" />{aud(o.totalAUD, 2)}</Link>
              ))}
            </div>
          )}
          {hasCustomer && <Link to={`/customers/${encodeURIComponent(open.email.toLowerCase())}`} className="btn btn--sm" style={{ alignSelf: 'flex-start' }}><User size={14} /> View customer</Link>}
          <div className="field">Conversation
            <div className="thread">
              <div className="thread__msg"><span className="thread__meta">{open.name} · {open.createdAt?.toDate().toLocaleString('en-AU') ?? ''}</span>{open.message}</div>
              {(open.replies || []).map((r, i) => (
                <div key={i} className="thread__msg thread__msg--out">
                  <span className="thread__meta">You ({r.by}) · {r.sentAt?.toDate().toLocaleString('en-AU') ?? ''} · Resend <code>{r.resendId || 'not sent'}</code></span>{r.body}
                </div>
              ))}
            </div>
          </div>
        </Drawer>
      )}
      {open && replying && (
        <ComposeEmail
          target={{ to: open.email, name: open.name, subject: `Re: your AXIA ${open.topic.toLowerCase()} enquiry`, inquiryId: open.id, quote: open.message,
            ...(mentioned.length === 1 ? { orderId: mentioned[0].id, orderNumber: orderNo(mentioned[0]) } : {}) }}
          onClose={() => setReplying(false)}
          onSent={msg => { setReplying(false); toast.show(msg); }} />
      )}
      {toast.node}
    </>
  );
}
