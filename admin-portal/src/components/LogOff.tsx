import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Logo from './Logo';

const DURATION = 2600;

/** Full-screen farewell shown before signing out. Calls onDone when it finishes; onCancel keeps the session. */
export default function LogOff({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(onDone, reduce ? 900 : DURATION);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    addEventListener('keydown', key);
    return () => { clearTimeout(t); removeEventListener('keydown', key); };
  }, [onDone, onCancel]);

  const letters = (word: string, delay: number) => [...word].map((ch, i) => (
    <span key={i} className="logoff__ch" style={{ animationDelay: `${delay + i * 55}ms` }}>{ch === ' ' ? ' ' : ch}</span>
  ));

  return createPortal(
    <div className="logoff" role="alertdialog" aria-live="assertive" aria-label="Aight, logging off">
      <div className="logoff__glow logoff__glow--ice" />
      <div className="logoff__glow logoff__glow--magenta" />
      <div className="logoff__in">
        <Logo height={20} className="logoff__logo" />
        <div className="logoff__big" aria-hidden="true">{letters('AIGHT', 250)}</div>
        <div className="logoff__sub" aria-hidden="true">{letters('LOGGING OFF', 650)}</div>
        <div className="logoff__bar"><i style={{ animationDuration: `${DURATION - 300}ms` }} /></div>
        <button className="logoff__stay" onClick={onCancel}>Wait, keep me signed in</button>
      </div>
    </div>,
    document.body,
  );
}
