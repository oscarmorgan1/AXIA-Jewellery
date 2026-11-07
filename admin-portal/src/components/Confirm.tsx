import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, X } from 'lucide-react';

/**
 * Designed replacement for window.confirm. `const confirm = useConfirm()`, then
 * `if (!(await confirm({ ... }))) return;`. Set `word` on risky actions (opening
 * or closing the shop, taking the site down, permanent deletes) and the confirm
 * button stays off until that word is typed.
 */
export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** danger: red, for deletes and taking the site down. warn: amber. primary: the normal button. */
  tone?: 'danger' | 'warn' | 'primary';
  icon?: ReactNode;
  /** A word the user must type to confirm. Matched ignoring case and surrounding spaces. */
  word?: string;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const Ctx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>(resolve => {
    setPending(prev => { prev?.resolve(false); return { ...o, resolve }; });
  }), []);
  const close = useCallback((ok: boolean) => {
    setPending(p => { p?.resolve(ok); return null; });
  }, []);
  return (
    <Ctx.Provider value={confirm}>
      {children}
      {pending && <ConfirmDialog key={pending.title} opts={pending} onClose={close} />}
    </Ctx.Provider>
  );
}

function ConfirmDialog({ opts, onClose }: { opts: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const tone = opts.tone ?? 'primary';
  const [typed, setTyped] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const word = opts.word?.trim();
  const ok = !word || typed.trim().toUpperCase() === word.toUpperCase();

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    (word ? input.current : cancel.current)?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(false); };
    addEventListener('keydown', k);
    return () => { removeEventListener('keydown', k); back?.focus?.(); };
  }, [onClose, word]);

  const icon = opts.icon ?? (tone === 'primary' ? <Info size={20} /> : <AlertTriangle size={20} />);

  return createPortal(
    <>
      <div className="overlay overlay--confirm" onClick={() => onClose(false)} />
      <div className={`confirm confirm--${tone}`} role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className="icon-btn confirm__x" onClick={() => onClose(false)} aria-label="Close"><X size={18} /></button>
        <div className="confirm__icon" aria-hidden="true">{icon}</div>
        <h2 id={titleId} className="confirm__title">{opts.title}</h2>
        {opts.body && <div className="confirm__body">{opts.body}</div>}
        <form onSubmit={e => { e.preventDefault(); if (ok) onClose(true); }}>
          {word && (
            <label className="confirm__word">
              <span>Type <b>{word}</b> to confirm</span>
              <input ref={input} className="input" value={typed} onChange={e => setTyped(e.target.value)}
                autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder={word} aria-invalid={typed !== '' && !ok} />
            </label>
          )}
          <div className="confirm__actions">
            <button ref={cancel} type="button" className="btn" onClick={() => onClose(false)}>{opts.cancelLabel ?? 'Cancel'}</button>
            <button type="submit" className={`btn confirm__go confirm__go--${tone}`} disabled={!ok}>{opts.confirmLabel}</button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}
