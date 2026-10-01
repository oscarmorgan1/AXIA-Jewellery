import { useId, useState } from 'react';

const H = 300;
const PAD = { l: 48, r: 12, t: 36, b: 32 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

const short = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);

function Hatch({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="8" height="8" fill={color} />
      <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,.22)" strokeWidth="3" />
    </pattern>
  );
}

function Axis({ max, W, ticks = 6 }: { max: number; W: number; ticks?: number }) {
  const ih = H - PAD.t - PAD.b;
  return (
    <g>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = (max / ticks) * i;
        const y = PAD.t + ih - (v / max) * ih;
        return (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="var(--line-strong)" strokeDasharray="3 5" />
            <text x={PAD.l - 10} y={y + 4} textAnchor="end">{short(v)}</text>
          </g>
        );
      })}
    </g>
  );
}

/** Rounded bars in a soft fill; the highlighted bar goes solid with a tooltip. */
export function BarChart({ data, format, W = 720 }: { data: { label: string; value: number }[]; format: (n: number) => string; W?: number }) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(0, ...data.map(d => d.value));
  const max = top <= 5 ? 5 : niceMax(top);
  const ticks = top <= 5 ? 5 : 6;
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const slot = iw / Math.max(1, data.length);
  const bw = Math.min(60, slot * 0.62);
  const active = hover ?? data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart">
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--bar)" /><stop offset="1" stopColor="var(--bar)" stopOpacity=".55" /></linearGradient>
      </defs>
      <Axis max={max} W={W} ticks={ticks} />
      {data.map((d, i) => {
        const h = d.value > 0 ? Math.max(10, (d.value / max) * ih) : 5;
        const x = PAD.l + slot * i + (slot - bw) / 2;
        const y = PAD.t + ih - h;
        const on = i === active;
        return (
          <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
            <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={ih} fill="transparent" />
            <rect className="bar" style={{ animationDelay: `${i * 60}ms` }} x={x} y={y} width={bw} height={h} rx={Math.min(14, bw / 2, h / 2)} fill={on ? 'var(--bar-strong)' : `url(#g${id})`} />
            <text x={x + bw / 2} y={H - 8} textAnchor="middle">{d.label}</text>
            {on && (
              <g>
                <rect x={x + bw / 2 - 46} y={y - 36} width="92" height="26" rx="13" fill="var(--obsidian)" stroke="var(--ice)" strokeOpacity=".5" />
                <text x={x + bw / 2} y={y - 18} textAnchor="middle" style={{ fill: '#F4F1EA', fontWeight: 600 }}>{format(d.value)}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Stacked bars: solid bottom segment (cost) under a hatched ice top segment (margin). */
export function StackedBars({ data, format, W = 460 }: {
  data: { label: string; bottom: number; top: number }[]; format: (n: number) => string; W?: number;
}) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map(d => d.bottom + Math.max(0, d.top))));
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const slot = iw / Math.max(1, data.length);
  const bw = Math.min(42, slot * 0.6);
  const gap = 6;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Stacked bar chart">
      <defs><Hatch id={`s${id}`} color="#9FD3EA" /></defs>
      <Axis max={max} W={W} ticks={5} />
      {data.map((d, i) => {
        const x = PAD.l + slot * i + (slot - bw) / 2;
        const hb = (d.bottom / max) * ih;
        const ht = (Math.max(0, d.top) / max) * ih;
        const yb = PAD.t + ih - hb;
        const yt = yb - ht - (ht > 0 ? gap : 0);
        return (
          <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={ih} fill="transparent" />
            <rect className="bar" style={{ animationDelay: `${i * 60}ms` }} x={x} y={yb} width={bw} height={Math.max(0, hb)} rx="8" fill="var(--bar-strong)" />
            {ht > 0 && <rect className="bar" style={{ animationDelay: `${i * 60 + 120}ms` }} x={x} y={yt} width={bw} height={ht} rx="8" fill={`url(#s${id})`} />}
            <text x={x + bw / 2} y={H - 8} textAnchor="middle">{d.label}</text>
            {hover === i && (
              <g>
                <rect x={Math.min(W - 150, Math.max(PAD.l, x + bw / 2 - 70))} y={Math.max(2, yt - 52)} width="140" height="44" rx="10" fill="var(--obsidian)" />
                <text x={Math.min(W - 80, Math.max(PAD.l + 70, x + bw / 2))} y={Math.max(2, yt - 52) + 18} textAnchor="middle" style={{ fill: '#fff' }}>Cost {format(d.bottom)}</text>
                <text x={Math.min(W - 80, Math.max(PAD.l + 70, x + bw / 2))} y={Math.max(2, yt - 52) + 35} textAnchor="middle" style={{ fill: '#C7EAF7' }}>Margin {format(d.top)}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
