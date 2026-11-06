import { useEffect, useState } from 'react';

/**
 * Larp mode: the dashboard shows made-up, millionaire-sized numbers.
 * Display only. It lives in this browser's localStorage and never touches Firestore or the public site.
 */
const KEY = 'axia_admin_larp';
const EVENT = 'axia-larp-change';

function read(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function useLarpMode() {
  const [on, setOn] = useState(read);
  useEffect(() => {
    const sync = () => setOn(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  const set = (v: boolean) => {
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* ignore */ }
    setOn(v);
    window.dispatchEvent(new Event(EVENT));
  };
  return { on, set };
}

/** Stable pseudo-random number in [0, 1) for a string, so fake numbers don't jump around between renders. */
export function noise(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/** A fake number around `base`, wobbling by up to ±`spread` (0..1), stable for the seed. */
export const fake = (base: number, seed: string, spread = 0.15) =>
  Math.round(base * (1 - spread + 2 * spread * noise(seed)));

/** Compact money for big numbers: A$4.82M, A$318K. */
export function audCompact(n: number) {
  if (n >= 1e6) return `A$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `A$${Math.round(n / 1e3)}K`;
  return `A$${Math.round(n)}`;
}
