/**
 * Shows a figure, formatted. It used to count up from zero on every load;
 * figures in a working tool now appear as they are. `duration` is still
 * accepted so existing callers don't change.
 */
export default function CountUp({ value, format = n => Math.round(n).toLocaleString('en-AU') }: {
  value: number | null | undefined; format?: (n: number) => string; duration?: number;
}) {
  if (value == null || Number.isNaN(value)) return <>n/a</>;
  return <>{format(value)}</>;
}
