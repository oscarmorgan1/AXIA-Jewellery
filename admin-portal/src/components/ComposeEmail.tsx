import { useState } from 'react';
import { Mail, Send } from 'lucide-react';
import Drawer from './Drawer';
import { adminApi } from '../lib/api';

export interface ComposeTarget {
  to: string;
  name?: string;
  subject?: string;
  /** Reply to this Inbox inquiry (its message is quoted under the reply). */
  inquiryId?: string;
  /** About this order (the email is logged on the order too). */
  orderId?: string;
  orderNumber?: string;
  quote?: string;
}

/** Write an email to a customer, check exactly what will be sent, then send it through Resend. */
export default function ComposeEmail({ target, onClose, onSent }: { target: ComposeTarget; onClose: () => void; onSent: (msg: string) => void }) {
  const [subject, setSubject] = useState(target.subject || 'A note from AXIA');
  const [body, setBody] = useState('');
  const [markDone, setMarkDone] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const first = (target.name || '').trim().split(/\s+/)[0];

  async function send() {
    setBusy(true); setError('');
    try {
      await adminApi('/messages/send', { to: target.to, name: target.name, subject, body, inquiryId: target.inquiryId, orderId: target.orderId, markDone });
      onSent(`Sent to ${target.to}`);
    } catch (e) { setError((e as Error).message); setConfirming(false); } finally { setBusy(false); }
  }

  return (
    <Drawer title={target.inquiryId ? 'Reply' : `Message ${target.name || target.to}`} onClose={onClose} footer={confirming ? <>
      <button className="btn" onClick={() => setConfirming(false)} disabled={busy}>Back</button><span style={{ flex: 1 }} />
      <button className="btn btn--primary" onClick={send} disabled={busy}><Send size={15} /> {busy ? 'Sending…' : 'Send email'}</button>
    </> : <>
      <button className="btn" onClick={onClose}>Cancel</button><span style={{ flex: 1 }} />
      <button className="btn btn--primary" onClick={() => setConfirming(true)} disabled={!subject.trim() || body.trim().length < 2}>Review</button>
    </>}>
      {error && <div className="notice notice--error">{error}</div>}
      {!confirming ? <>
        <dl className="kv kv--left">
          <dt>To</dt><dd>{target.name ? `${target.name} · ` : ''}{target.to}</dd>
          {target.orderNumber && <><dt>Order</dt><dd>#{target.orderNumber}</dd></>}
        </dl>
        <label className="field">Subject<input className="input" value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} /></label>
        <label className="field">Message
          <textarea className="textarea" style={{ minHeight: 220 }} value={body} autoFocus placeholder={'Write your message. A greeting, sign-off and help centre link are added for you.'} onChange={e => setBody(e.target.value)} />
        </label>
        {target.inquiryId && <label className="check"><input type="checkbox" checked={markDone} onChange={e => setMarkDone(e.target.checked)} /> Mark the inquiry done after sending</label>}
        {target.quote && <div className="card__sub">Their message is quoted under your reply.</div>}
      </> : (
        <div className="confirm">
          <div className="notice notice--warn"><Mail size={15} /> This sends straight away to <b>{target.to}</b> from the AXIA orders address. Replies come back to your support inbox.</div>
          <div className="email-preview">
            <div className="email-preview__subject">{subject}</div>
            {first && <p>Hi {first},</p>}
            {body.trim().split(/\n{2,}/).map((t, i) => <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{t}</p>)}
            <p>Warm regards,<br /><b>The AXIA team</b></p>
            {target.orderNumber && <p className="muted">Order #{target.orderNumber}</p>}
            {target.quote && <blockquote>{target.quote}</blockquote>}
          </div>
        </div>
      )}
    </Drawer>
  );
}
