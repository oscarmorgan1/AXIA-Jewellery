import { useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import Drawer from './Drawer';

/**
 * A delete that can't be undone: says what goes, and for the big ones asks for
 * a word (the order number, their email) to be typed back before it runs.
 */
export default function ConfirmDelete({ title, children, phrase, phraseLabel, action, onClose, onConfirm }: {
  title: string;
  children: ReactNode;
  /** Typed back to enable the button. */
  phrase?: string;
  phraseLabel?: ReactNode;
  action: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const norm = (s: string) => s.trim().replace(/^#/, '').toLowerCase();
  const ready = !phrase || norm(typed) === norm(phrase);

  async function run() {
    setBusy(true); setError('');
    try { await onConfirm(); } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <Drawer title={title} onClose={busy ? () => {} : onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <span style={{ flex: 1 }} />
      <button className="btn btn--danger-solid" onClick={run} disabled={busy || !ready}><Trash2 size={15} /> {busy ? 'Deleting…' : action}</button>
    </>}>
      {error && <div className="notice notice--error">{error}</div>}
      <div className="confirm-delete">{children}</div>
      {phrase && (
        <label className="field" style={{ marginTop: 18 }}>
          <span>{phraseLabel || <>Type <b>{phrase}</b> to confirm</>}</span>
          <input className="input" value={typed} autoFocus autoComplete="off" spellCheck={false} onChange={e => setTyped(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && ready && !busy) run(); }} />
        </label>
      )}
    </Drawer>
  );
}
