import { useEffect, useState } from 'react';

/**
 * Larp mode: the dashboard shows made-up, rich-looking numbers at one of five levels.
 * Display only. It lives in this browser's localStorage and never touches Firestore or the public site.
 */
const KEY = 'axia_admin_larp';
const EVENT = 'axia-larp-change';

export interface LarpLevel {
  /** what's stored; kept stable so a saved choice survives new levels being added */
  id: 1 | 2 | 3 | 4 | 5;
  name: string;
  blurb: string;
  /** multiplies every fake count and dollar figure (Millionaire is 1) */
  scale: number;
  margin: number;
  growth: string;
}

/** Listed smallest to largest; the number shown is the position, not the id. */
export const LARP_LEVELS: LarpLevel[] = [
  { id: 5, name: 'Micro Larp', blurb: 'About A$50K a month. Doing numbers, quietly.', scale: 0.0104, margin: 52.6, growth: '+21%' },
  { id: 1, name: 'Side hustle', blurb: 'About A$240K a month. Quitting the day job soon.', scale: 0.05, margin: 64.2, growth: '+48%' },
  { id: 2, name: 'Millionaire', blurb: 'About A$4.8M a month. Lambo on order.', scale: 1, margin: 87.4, growth: '+312%' },
  { id: 3, name: 'Mogul', blurb: 'About A$96M a month. Buying the competition.', scale: 20, margin: 92.8, growth: '+1,140%' },
  { id: 4, name: 'Billionaire', blurb: 'About A$1.9B a month. Private island, plural.', scale: 400, margin: 98.6, growth: '+9,999%' },
];

/** 0 is off; 1 to 5 pick a level by id. The old on/off setting ('1') reads as Millionaire. */
function read(): number {
  try {
    const v = localStorage.getItem(KEY);
    if (v === '1') return 2;
    if (!v || !v.startsWith('level:')) return 0;
    const n = Number(v.slice(6));
    return LARP_LEVELS.some(l => l.id === n) ? n : 0;
  } catch { return 0; }
}

export function useLarpMode() {
  const [level, setLevel] = useState(read);
  useEffect(() => {
    const sync = () => setLevel(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  const set = (n: number) => {
    try { localStorage.setItem(KEY, n ? `level:${n}` : '0'); } catch { /* ignore */ }
    setLevel(n);
    window.dispatchEvent(new Event(EVENT));
  };
  return { level, on: level > 0, current: LARP_LEVELS.find(l => l.id === level) ?? null, set };
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

/** Compact numbers for big values: 1.9B, 4.8M, 318K. */
export function compact(n: number) {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  return Math.round(n).toLocaleString('en-AU');
}

/** Compact money for big numbers: A$1.92B, A$4.82M, A$318K. */
export function audCompact(n: number) {
  if (n >= 1e9) return `A$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `A$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `A$${Math.round(n / 1e3)}K`;
  return `A$${Math.round(n)}`;
}
