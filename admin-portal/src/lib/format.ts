export const aud = (n: number | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n)
    ? '–'
    : 'A$' + n.toLocaleString('en-AU', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const pct = (n: number | null | undefined, digits = 1) =>
  n == null || Number.isNaN(n) ? '–' : `${n.toFixed(digits)}%`;

export function timeAgo(ts: unknown): string {
  const d = ts && typeof (ts as { toDate?: () => Date }).toDate === 'function' ? (ts as { toDate: () => Date }).toDate() : null;
  if (!d) return '–';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
