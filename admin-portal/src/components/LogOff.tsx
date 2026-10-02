import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Logo from './Logo';

const DURATION = 2600;
const PUNCH_DURATION = 3400;

/**
 * Full-screen farewell shown before signing out. Calls onDone when it finishes.
 * "Keep me signed in" is a joke: it swaps in the punchline and logs off anyway.
 * Esc is the real way out (onCancel keeps the session).
 */
export default function LogOff({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [punch, setPunch] = useState(false);

  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(onDone, reduce ? (punch ? 1800 : 900) : punch ? PUNCH_DURATION : DURATION);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    addEventListener('keydown', key);
    return () => { clearTimeout(t); removeEventListener('keydown', key); };
  }, [onDone, onCancel, punch]);

  const letters = (word: string, delay: number, step = 55) => [...word].map((ch, i) => (
    <span key={i} className="logoff__ch" style={{ animationDelay: `${delay + i * step}ms` }}>{ch === ' ' ? ' ' : ch}</span>
  ));

  return createPortal(
    <div className="logoff" role="alertdialog" aria-live="assertive" aria-label={punch ? 'If you aren’t logged in, you’re logged off' : 'Aight, logging off'}>
      <div className="logoff__glow logoff__glow--ice" />
      <div className="logoff__glow logoff__glow--magenta" />
      {punch ? (
        <div className="logoff__in logoff__in--punch" key="punch">
          <Logo height={20} className="logoff__logo" />
          <div className="logoff__mid" aria-hidden="true">{letters('IF YOU AREN’T', 0, 35)}</div>
          <div className="logoff__mid" aria-hidden="true">{letters('LOGGED IN', 450, 35)}</div>
          <div className="logoff__big logoff__big--punch" aria-hidden="true">{letters('YOU’RE', 1000, 60)}</div>
          <div className="logoff__sub logoff__sub--hot" aria-hidden="true">{letters('LOGGED OFF', 1400)}</div>
          <div className="logoff__bar"><i style={{ animationDuration: `${PUNCH_DURATION - 300}ms` }} /></div>
        </div>
      ) : (
        <div className="logoff__in" key="bye">
          <Logo height={20} className="logoff__logo" />
          <div className="logoff__big" aria-hidden="true">{letters('AIGHT', 250)}</div>
          <div className="logoff__sub" aria-hidden="true">{letters('LOGGING OFF', 650)}</div>
          <div className="logoff__bar"><i style={{ animationDuration: `${DURATION - 300}ms` }} /></div>
          <button className="logoff__stay" onClick={() => setPunch(true)}>Wait, keep me signed in</button>
        </div>
      )}
    </div>,
    document.body,
  );
}
