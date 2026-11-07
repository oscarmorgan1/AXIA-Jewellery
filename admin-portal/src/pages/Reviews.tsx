import { useMemo, useState } from 'react';
import ReviewVideos, { saveReviewVideos } from '../components/ReviewVideos';
import { useProducts, useReviewVideos } from '../lib/data';
import { useToast } from '../components/Toast';
import type { ReviewVideo } from '../types';

/**
 * Review videos: one shared set (`site/reviews`) shown in the carousel under
 * the written reviews on every product page.
 */
export default function Reviews() {
  const reviews = useReviewVideos();
  const products = useProducts();
  const toast = useToast();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Clips uploaded before review videos were shared, still sitting on single products.
  const old = useMemo(() => {
    const have = new Set(reviews.data.map(v => v.src));
    const seen = new Set<string>();
    const out: ReviewVideo[] = [];
    for (const p of products.data) for (const v of p.reviewVideos ?? []) {
      if (!v?.src || have.has(v.src) || seen.has(v.src)) continue;
      seen.add(v.src); out.push(v);
    }
    return out;
  }, [reviews.data, products.data]);

  async function bringOver() {
    setBusy(true); setError('');
    try {
      await saveReviewVideos([...reviews.data, ...old]);
      toast.show(`Added ${old.length === 1 ? 'a video' : `${old.length} videos`} from your products.`);
    } catch (e) { setError(`Couldn’t add them: ${(e as Error).message}`); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-head">
        <h1>Reviews</h1>
      </div>
      {!reviews.loading && !products.loading && old.length > 0 && (
        <div className="notice notice--warn" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            {old.length === 1 ? 'One review video was' : `${old.length} review videos were`} uploaded on single products before review videos were shared.
            {!reviews.saved && ' Until you set up this list, those products keep showing them.'}
          </span>
          <button className="btn btn--sm" onClick={bringOver} disabled={busy}>{busy ? 'Adding…' : 'Add them here'}</button>
        </div>
      )}
      <div className="card">
        <div className="card__head"><div>
          <h2>Review videos</h2>
          <p className="card__sub">The same videos play on every product page, under the written reviews.</p>
        </div></div>
        {(error || reviews.error) && <div className="notice notice--error">{error || reviews.error?.message}</div>}
        {reviews.loading ? <div className="skeleton" style={{ height: 120 }} aria-hidden="true" />
          : <ReviewVideos videos={reviews.data} onError={setError} />}
      </div>
      {toast.node}
    </>
  );
}
