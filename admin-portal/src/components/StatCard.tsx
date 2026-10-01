import type { ReactNode } from 'react';

export default function StatCard({ label, value, icon, chip, foot }: {
  label: string; value: ReactNode; icon: ReactNode; chip?: ReactNode; foot?: ReactNode;
}) {
  return (
    <div className="card stat">
      <div className="stat__top"><span>{label}</span><span className="stat__icon">{icon}</span></div>
      <div className="stat__value">{value}{chip}</div>
      {foot && <div className="stat__foot">{foot}</div>}
    </div>
  );
}
