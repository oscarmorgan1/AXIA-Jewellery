import type { ReactNode } from 'react';

/** One figure in a stats strip: its label, the number, and an optional line under it. */
export default function StatCard({ label, value, chip, foot }: {
  label: string; value: ReactNode; chip?: ReactNode; foot?: ReactNode;
}) {
  return (
    <div className="card stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}{chip}</div>
      {foot && <div className="stat__foot">{foot}</div>}
    </div>
  );
}
