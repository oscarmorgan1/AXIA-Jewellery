import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Upload, VolumeX } from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, siteUrl } from '../firebase';
import { uploadVideo, type VideoStage } from '../lib/video';
import type { Product, ReviewVideo } from '../types';
import VideoProgress from './VideoProgress';
import { useConfirm } from './Confirm';

type Made = ReviewVideo & { sizeBytes: number; trimmed: boolean };

/** Saves the whole shared list (`site/reviews`) in its new order. */
export function saveReviewVideos(videos: ReviewVideo[]) {
  return setDoc(doc(db, 'site', 'reviews'), { videos, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * The customer review videos, shown in a portrait carousel under the written
 * reviews on every product page (the same set on each). Each upload is
 * converted by the server to a light 720p MP4 that keeps its sound (at most a
 * minute) plus a poster, and added to `site/reviews` as soon as it's converted.
 * Removing and reordering save straight away too.
 */
export default function ReviewVideos({ videos, products, onError }: { videos: ReviewVideo[]; products: Product[]; onError: (msg: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const [stage, setStage] = useState<VideoStage>('');
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');

  async function upload(files: File[]) {
    setNote('');
    const done: string[] = [];
    try {
      for (const file of files) {
        const { sizeBytes, trimmed, ...entry } = await uploadVideo<Made>('review', file, { stage: setStage, progress: setProgress });
        done.push(`${(sizeBytes / 1048576).toFixed(1)} MB${entry.seconds ? `, ${Math.round(entry.seconds)}s` : ''}${trimmed ? ', cut to the first minute' : ''}`);
      }
    } catch (e) { onError((e as Error).message); } finally {
      setStage('');
      if (input.current) input.current.value = '';
      if (done.length) setNote(`Added ${done.length === 1 ? 'a review video' : `${done.length} review videos`}: ${done.join('; ')}.`);
    }
  }

  async function commit(next: ReviewVideo[], msg: string) {
    try {
      await saveReviewVideos(next);
      setNote(msg);
    } catch (e) { onError(`Couldn’t update the review videos: ${(e as Error).message}`); }
  }

  async function remove(i: number) {
    if (!(await confirm({ title: 'Remove this review video?', body: 'It comes off every product page.', tone: 'danger', confirmLabel: 'Remove video' }))) return;
    commit(videos.filter((_, k) => k !== i), 'Review video removed.');
  }

  function link(i: number, productId: string) {
    const next = videos.map((v, k) => {
      if (k !== i) return v;
      const { productId: _, ...rest } = v;
      return productId ? { ...rest, productId } : rest;
    });
    const name = products.find(p => p.id === productId)?.name;
    commit(next, name ? `Linked to ${name}.` : 'Product link removed.');
  }

  function move(i: number, by: number) {
    const j = i + by;
    if (j < 0 || j >= videos.length) return;
    const next = [...videos];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next, 'Order saved.');
  }

  return (
    <div className="review-videos">
      <small className="review-videos__help">Shown in this order in a carousel under the written reviews, on every product page. Pick the product in each video and a small card under it links to that product. Film them portrait. Any video works: it’s converted to a small 720p file with its sound kept, at most a minute long.</small>
      {videos.length > 0 && (
        <ul className="review-videos__list">
          {videos.map((v, i) => (
            <li key={v.id || v.src} className="review-videos__item">
              <video className="review-videos__preview" src={siteUrl(v.src)} poster={v.poster ? siteUrl(v.poster) : undefined} playsInline controls preload="none" />
              <div className="review-videos__meta">
                <span>{i + 1}{v.seconds ? ` · ${Math.round(v.seconds)}s` : ''}</span>
                {v.audio === false && <span title="No sound"><VolumeX size={12} /></span>}
              </div>
              <select className="input review-videos__product" aria-label={`Product in video ${i + 1}`} value={v.productId ?? ''}
                disabled={!!stage} onChange={e => link(i, e.target.value)}>
                <option value="">No product</option>
                {v.productId && !products.some(p => p.id === v.productId) && <option value={v.productId}>Deleted product</option>}
                {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.hidden ? ' (hidden)' : ''}</option>)}
              </select>
              <div className="review-videos__actions">
                <button type="button" className="btn btn--sm" aria-label="Move earlier" disabled={!!stage || i === 0} onClick={() => move(i, -1)}><ChevronLeft size={14} /></button>
                <button type="button" className="btn btn--sm" aria-label="Move later" disabled={!!stage || i === videos.length - 1} onClick={() => move(i, 1)}><ChevronRight size={14} /></button>
                <button type="button" className="btn btn--sm" aria-label="Remove" disabled={!!stage} onClick={() => remove(i)}><Trash2 size={14} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {note && <small className="review-videos__help">{note}</small>}
      <VideoProgress stage={stage} progress={progress} />
      <div>
        <input ref={input} type="file" multiple accept="video/mp4,video/quicktime,video/webm,video/*" hidden
          onChange={e => e.target.files?.length && upload([...e.target.files])} />
        <button type="button" className="btn btn--sm btn--primary" onClick={() => input.current?.click()} disabled={!!stage}>
          <Upload size={14} /> {videos.length ? 'Add review videos' : 'Upload review videos'}
        </button>
      </div>
    </div>
  );
}
