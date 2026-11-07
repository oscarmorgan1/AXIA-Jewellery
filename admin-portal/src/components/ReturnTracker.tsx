/**
 * A return's progress as a row of steps (a column on phones): each step done so
 * far is filled in with its date. `ended` greys the bar out for a return that
 * was declined or withdrawn part way.
 */
export default function ReturnTracker({ steps, at, ended }: { steps: { label: string; when?: string }[]; at: number; ended?: boolean }) {
  return (
    <ol className={`rtrack${ended ? ' rtrack--ended' : ''}`} style={{ ['--steps' as string]: steps.length }} aria-label="Return progress">
      {steps.map((s, i) => {
        const done = at >= i;
        return (
          <li key={s.label} className={`${done ? 'done' : ''}${at === i ? ' now' : ''}`} aria-current={at === i ? 'step' : undefined}>
            <span className="rtrack__bar" />
            <b>{s.label}</b>
            <small>{done ? s.when || '' : ''}</small>
          </li>
        );
      })}
    </ol>
  );
}
