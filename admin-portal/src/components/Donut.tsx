import { useState } from 'react';

export interface Slice { label: string; value: number; color: string }

/** Animated ring chart with a centre total. */
export default function Donut({ data, centerLabel, centerValue, size = 200 }: {
  data: Slice[]; centerLabel: string; centerValue: string; size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const r = 80, c = 2 * Math.PI * r, gap = 6;
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  let acc = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={centerLabel}>
        <circle cx="100" cy="100" r={r} fill="none" stroke="var(--soft)" strokeWidth="16" />
        {data.map((d, i) => {
          const len = Math.max(0, (d.value / total) * c - gap);
          const off = acc; acc += (d.value / total) * c;
          return (
            <circle key={d.label} className="donut-seg" cx="100" cy="100" r={r} fill="none" stroke={d.color}
              strokeWidth={hover === i ? 22 : 16} strokeLinecap="round" strokeDasharray={`${len} ${c}`} strokeDashoffset={-off}
              transform="rotate(-90 100 100)" opacity={hover == null || hover === i ? 1 : .35}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              style={{ transition: 'stroke-dasharray 1s cubic-bezier(.2,.8,.2,1), opacity .2s, stroke-width .2s' }}>
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="donut-center">
        <small>{hover != null ? data[hover].label : centerLabel}</small>
        <b>{hover != null ? data[hover].value : centerValue}</b>
      </div>
    </div>
  );
}
