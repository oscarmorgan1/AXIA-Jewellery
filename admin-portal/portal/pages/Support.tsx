import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MessageSquare, Send } from 'lucide-react';
import { accountApi } from '../api';
import { useMyOrders } from '../orders';
import { TOPICS, useMyThreads, when } from '../support';

/** /portal/support: their conversations with the team, and a form to start one. */
export default function Support() {
  const { threads, error } = useMyThreads();
  const { orders } = useMyOrders();
  const [params] = useSearchParams();
  const nav = useNavigate();
  // From an order page: /support?order=<order id> starts a message about it.
  const fromOrder = params.get('order') || '';
  const [topic, setTopic] = useState(fromOrder ? 'My order' : '');
  const [orderId, setOrderId] = useState(fromOrder);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { document.title = 'Support · AXIA'; }, []);
  useEffect(() => { if (fromOrder) formRef.current?.scrollIntoView({ block: 'start' }); }, [fromOrder]);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setSendError('');
    try {
      const { id } = await accountApi<{ id: string }>('/messages', { topic: topic || 'Something else', orderId: orderId || undefined, body });
      nav(`/support/${encodeURIComponent(id)}`);
    } catch (err) { setSendError((err as Error).message); setBusy(false); }
  }

  return (
    <div className="page pt-page">
      <div className="page-head"><h1>Support</h1><p className="lede">Message the AXIA team about an order, sizing, care or anything else. We usually reply within a day.</p></div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}

      {threads === null ? <div className="card"><div className="skeleton" style={{ height: 72 }} /></div>
        : threads.length > 0 && (
          <div className="card pt-threads">
            {threads.map(t => {
              const last = t.messages[t.messages.length - 1];
              return (
                <Link key={t.id} to={`/support/${encodeURIComponent(t.id)}`} className={`pt-thread${t.unread ? ' is-unread' : ''}`}>
                  <span className="pt-thread__dot" aria-hidden="true" />
                  <span className="pt-thread__body">
                    <b>{t.subject}</b>
                    <small>{last ? `${last.from === 'axia' ? 'AXIA: ' : 'You: '}${last.body}` : ''}</small>
                  </span>
                  <span className="pt-thread__meta">
                    <small>{when(t.lastAt)}</small>
                    {t.unread ? <span className="chip chip--ice">New reply</span>
                      : t.state === 'open' ? <span className="chip chip--muted chip--plain">Waiting for us</span>
                      : <span className="chip chip--good chip--plain">Replied</span>}
                  </span>
                  {t.unread && <span className="sr-only">Unread</span>}
                </Link>
              );
            })}
          </div>
        )}

      <form ref={formRef} className="card" onSubmit={send}>
        <div className="card__head"><h2>{threads && threads.length ? 'New message' : 'Send us a message'}</h2></div>
        {threads && !threads.length && <p className="card__sub" style={{ marginTop: 0 }}><MessageSquare size={14} style={{ verticalAlign: '-2px' }} /> Your conversations with us appear here, and we email you when we reply.</p>}
        <div className="form-grid">
          <label className="field">Topic
            <select className="select" value={topic} onChange={e => setTopic(e.target.value)} required>
              <option value="" disabled>Choose a topic</option>
              {TOPICS.map(t => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="field">Order
            <select className="select" value={orderId} onChange={e => setOrderId(e.target.value)}>
              <option value="">Not about an order</option>
              {(orders || []).map(o => <option key={o.id} value={o.id}>#{o.orderNumber}</option>)}
            </select>
          </label>
          <label className="field full">Message
            <textarea className="textarea" value={body} onChange={e => setBody(e.target.value)} maxLength={5000} required minLength={4}
              placeholder="How can we help?" style={{ minHeight: 140 }} />
          </label>
        </div>
        {sendError && <div className="notice notice--error" role="alert" style={{ marginTop: 12 }}>{sendError}</div>}
        <div className="pt-actions">
          <button className="btn btn--primary" disabled={busy || body.trim().length < 4 || !topic}><Send size={15} /> {busy ? 'Sending…' : 'Send message'}</button>
        </div>
      </form>
    </div>
  );
}
