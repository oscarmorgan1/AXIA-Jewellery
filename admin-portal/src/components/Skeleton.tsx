/**
 * Placeholders in the shape of what's loading, so the page holds its layout
 * instead of jumping when data arrives. All are aria-hidden; the wrapper that
 * holds them carries aria-busy.
 */

/** One grey bar. `w` is a CSS width, `h` a height in px. */
export function Bone({ w = '100%', h = 12, className = '' }: { w?: string | number; h?: number; className?: string }) {
  return <span className={`skeleton ${className}`} style={{ width: w, height: h }} aria-hidden="true" />;
}

/** Ruled rows, like a table or list body. `thumb` adds a square on the left. */
export function SkeletonRows({ rows = 5, thumb = false, cols = 3 }: { rows?: number; thumb?: boolean; cols?: number }) {
  return (
    <div className="sk-rows" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div className="sk-row" key={i}>
          {thumb && <Bone w={40} h={40} />}
          <div className="sk-row__main"><Bone w={`${62 - (i % 3) * 12}%`} h={12} /><Bone w="28%" h={10} /></div>
          {Array.from({ length: cols - 1 }, (_, c) => <Bone key={c} w={64} h={12} />)}
        </div>
      ))}
    </div>
  );
}

/** A stats strip with `n` cells. */
export function SkeletonStats({ n = 4 }: { n?: number }) {
  return (
    <div className={n === 3 ? 'grid-3' : 'grid-4'} aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }, (_, i) => (
        <div className="card stat" key={i}>
          <Bone w="55%" h={12} />
          <Bone w="40%" h={28} className="sk-figure" />
          <Bone w="35%" h={10} />
        </div>
      ))}
    </div>
  );
}

/** A card with a heading bar over a block (a chart) or rows. */
export function SkeletonCard({ block, rows = 4 }: { block?: number; rows?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="Loading">
      <div className="card__head"><Bone w={120} h={16} /></div>
      {block ? <Bone h={block} /> : <SkeletonRows rows={rows} cols={2} />}
    </div>
  );
}

/** A whole page: a title, then a card of rows. Used while a page's code or record loads. */
export function SkeletonPage({ stats = false }: { stats?: boolean }) {
  return (
    <div className="sk-page" aria-busy="true" aria-label="Loading">
      <div className="page-head"><Bone w={220} h={32} /></div>
      {stats && <SkeletonStats />}
      <SkeletonCard rows={6} />
    </div>
  );
}
