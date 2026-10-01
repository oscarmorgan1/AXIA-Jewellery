import type { ReactNode } from 'react';

export default function StatCard({ label, value, icon, tone = '', chip, foot }: {
  label: string; value: ReactNode; icon: ReactNode; tone?: '' | 'ice' | 'dark' | 'magenta' | 'good'; chip?: ReactNode; foot?: ReactNode;
}) {
  return (
    <div className="card card--hover stat">
      <span className={`stat__icon${tone ? ` stat__icon--${tone}` : ''}`}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div className="stat__label">{label}</div>
        <div className="stat__value">{value}{chip}</div>
        {foot && <div className="stat__foot">{foot}</div>}
      </div>
    </div>
  );
}
