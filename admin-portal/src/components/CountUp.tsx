import { useEffect, useRef, useState } from 'react';

/** Animates a number from its previous value to `value`. */
export default function CountUp({ value, format = n => Math.round(n).toLocaleString('en-AU'), duration = 900 }: {
  value: number | null | undefined; format?: (n: number) => string; duration?: number;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (value == null || Number.isNaN(value)) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now(), a = from.current, b = value;
    if (reduce) { setShown(b); from.current = b; return; }
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(a + (b - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = b; };
  }, [value, duration]);
  if (value == null || Number.isNaN(value)) return <>–</>;
  return <>{format(shown)}</>;
}
