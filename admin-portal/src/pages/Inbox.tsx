import { useMemo, useState } from 'react';
import { Check, Inbox as InboxIcon, Mail, RotateCcw, Trash2 } from 'lucide-react';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useMessages } from '../lib/data';
import Drawer from '../components/Drawer';
import { useToast } from '../components/Toast';
import type { Message } from '../types';

type Filter = 'new' | 'done' | 'all';

export default function Inbox() {
  const { data: messages, loading, error } = useMessages();
  const [filter, setFilter] = useState<Filter>('new');
  const [openId, setOpenId] = useState<string | null>(null);
  const toast = useToast();

  const counts = { new: messages.filter(m => m.status !== 'done').length, done: messages.filter(m => m.status === 'done').length, all: messages.length };
  const shown = useMemo(() => messages.filter(m => filter === 'all' || (filter === 'done' ? m.status === 'done' : m.status !== 'done')), [messages, filter]);
  const open = messages.find(m => m.id === openId) || null;

  async function setStatus(m: Message, status: 'new' | 'done') {
    await updateDoc(doc(db, 'messages', m.id), { status });
    toast.show(status === 'done' ? 'Marked as done' : 'Moved back to new');
    if (status === 'done') setOpenId(null);
  }
  async function remove(m: Message) {
    if (!confirm(`Delete this message from ${m.name}?`)) return;
    await deleteDoc(doc(db, 'messages', m.id));
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
                <b>{m.name} <span className="chip chip--muted chip--plain" style={{ marginLeft: 6 }}>{m.topic}</span></b>
                <small>{m.message.slice(0, 120)}</small>
              </div>
              <small style={{ color: 'var(--faint)', whiteSpace: 'nowrap' }}>{m.createdAt?.toDate().toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</small>
            </button>
          ))}
        </div>
        {!loading && !shown.length && <div className="empty"><InboxIcon size={28} /><b>{filter === 'new' ? 'All caught up' : 'Nothing here'}</b>{filter === 'new' ? 'New messages from the Support page will appear here.' : ''}</div>}
      </div>

      {open && (
        <Drawer title={open.name} onClose={() => setOpenId(null)}
          footer={<>
            <button className="btn btn--danger" onClick={() => remove(open)}><Trash2 size={15} /> Delete</button>
            <span style={{ flex: 1 }} />
            {open.status === 'done'
              ? <button className="btn" onClick={() => setStatus(open, 'new')}><RotateCcw size={15} /> Mark as new</button>
              : <button className="btn" onClick={() => setStatus(open, 'done')}><Check size={15} /> Mark done</button>}
            <a className="btn btn--primary" href={`mailto:${open.email}?subject=${encodeURIComponent(`Re: your AXIA ${open.topic.toLowerCase()}`)}`}><Mail size={15} /> Reply</a>
          </>}>
          <dl className="kv">
            <dt>From</dt><dd>{open.email}</dd>
            <dt>Topic</dt><dd>{open.topic}</dd>
            <dt>Order number</dt><dd>{open.order || '–'}</dd>
            <dt>Received</dt><dd>{open.createdAt?.toDate().toLocaleString('en-AU') ?? '–'}</dd>
          </dl>
          <div className="card" style={{ background: 'var(--soft)', boxShadow: 'none', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{open.message}</div>
        </Drawer>
      )}
      {toast.node}
    </>
  );
}
