import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import { accountApi } from '../api';
import { useMyThread, when } from '../support';

/** /portal/support/:id: one conversation, live, with a reply box. Opening it marks the team's replies read. */
export default function Thread() {
  const { id = '' } = useParams();
  const { thread, error } = useMyThread(id);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const count = thread ? thread.messages.length : 0;

  useEffect(() => { document.title = `${thread?.subject || 'Support'} · AXIA`; }, [thread?.subject]);
  useEffect(() => { if (thread?.unread) accountApi(`/messages/${encodeURIComponent(id)}/read`).catch(() => {}); }, [id, thread?.unread]);
  useEffect(() => { if (count) endRef.current?.scrollIntoView({ block: 'nearest' }); }, [count]);

  async function reply(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setSendError('');
    try { await accountApi(`/messages/${encodeURIComponent(id)}/reply`, { body }); setBody(''); }
    catch (err) { setSendError((err as Error).message); }
    finally { setBusy(false); }
  }

  const back = <Link to="/support" className="icon-btn" aria-label="All messages"><ArrowLeft size={18} /></Link>;
  const head = (title: string) => <div className="page-head">{back}<h1>{title}</h1></div>;
  if (error) return <div className="page pt-page">{head('Support')}<div className="notice notice--error" role="alert">{error}</div></div>;
  if (thread === undefined) return <div className="page pt-page">{head('Support')}<div className="card"><div className="skeleton" style={{ height: 160 }} /></div></div>;
  if (thread === null) return <div className="page pt-page">{head('Support')}<div className="card empty"><b>Conversation not found</b><p>It may have been closed. Start a new message from Support.</p></div></div>;

  return (
    <div className="page pt-page">
      <div className="page-head">
        {back}
        <h1>{thread.subject}</h1>
        <p className="lede">
          {thread.orderId ? <>About <Link to={`/orders/${encodeURIComponent(thread.orderId)}`}>order #{thread.orderNumber}</Link>. </> : null}
          {thread.closedAt ? 'This case is closed.' : thread.state === 'open' ? 'We’ll reply here and email you when we do.' : 'Reply below if there’s anything else.'}
        </p>
      </div>
      <div className="card">
        <div className="pt-convo">
          {thread.messages.map((m, i) => (
            <div key={i} className={`pt-msg pt-msg--${m.from}`}>
              <small>{m.from === 'axia' ? 'AXIA team' : 'You'} · {when(m.at, true)}</small>
              <p>{m.body}</p>
            </div>
          ))}
          {thread.closedAt && (
            <div className="pt-closed" role="status"><CheckCircle2 size={16} /> <span><b>Case closed</b> · {when(thread.closedAt, true)}. Still need help? Reply below and we’ll reopen it.</span></div>
          )}
          <div ref={endRef} />
        </div>
        <form className="pt-reply" onSubmit={reply}>
          <label className="sr-only" htmlFor="pt-reply">Your reply</label>
          <textarea id="pt-reply" className="textarea" value={body} onChange={e => setBody(e.target.value)} maxLength={5000} placeholder={thread.closedAt ? 'Write to reopen this case…' : 'Write a reply…'} required />
          {sendError && <div className="notice notice--error" role="alert">{sendError}</div>}
          <div className="pt-actions" style={{ marginTop: 0 }}>
            <button className="btn btn--primary" disabled={busy || body.trim().length < 2}><Send size={15} /> {busy ? 'Sending…' : 'Send reply'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
