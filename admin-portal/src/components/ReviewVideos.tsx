import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Upload, VolumeX } from 'lucide-react';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, siteUrl } from '../firebase';
import { uploadVideo, type VideoStage } from '../lib/video';
import type { ReviewVideo } from '../types';
import VideoProgress from './VideoProgress';

type Made = ReviewVideo & { sizeBytes: number; trimmed: boolean; saved: boolean };

/**
 * Customer review videos for a product, shown on the product page in a portrait
 * carousel under the text reviews. Each upload is converted by the server to a
 * light 720p MP4 that keeps its sound (at most a minute) plus a poster, and is
 * added to the product as soon as it's converted. Removing and reordering save
 * straight away too, so none of it depends on pressing Save.
 */
export default function ReviewVideos({ productId, videos, onChange, onError }: {
  productId: string; videos: ReviewVideo[];
  onChange: (next: ReviewVideo[]) => void; onError: (msg: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<VideoStage>('');
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');

  async function upload(files: File[]) {
    if (!productId) return onError('Give the product a name first, so the videos are filed under its id.');
    setNote('');
    let list = videos;
    const done: string[] = [];
    try {
      for (const file of files) {
        const r = await uploadVideo<Made>('review', file, { stage: setStage, progress: setProgress }, { productId });
        const { sizeBytes, trimmed, saved, ...entry } = r;
        list = [...list, entry];
        onChange(list);
        done.push(`${(sizeBytes / 1048576).toFixed(1)} MB${entry.seconds ? `, ${Math.round(entry.seconds)}s` : ''}${trimmed ? ', cut to the first minute' : ''}${saved ? '' : ' (save the product to publish it)'}`);
      }
    } catch (e) { onError((e as Error).message); } finally {
      setStage('');
      if (input.current) input.current.value = '';
      if (done.length) setNote(`Added ${done.length === 1 ? 'a review video' : `${done.length} review videos`}: ${done.join('; ')}.`);
    }
  }

  /** Writes the list to the product now (if it's been saved before) and to the draft. */
  async function commit(next: ReviewVideo[], msg: string) {
    try {
      const ref = doc(db, 'products', productId);
      if (productId && (await getDoc(ref)).exists()) await updateDoc(ref, { reviewVideos: next, updatedAt: serverTimestamp() });
      onChange(next);
      setNote(msg);
    } catch (e) { onError(`Couldn’t update the review videos: ${(e as Error).message}`); }
  }

  function remove(i: number) {
    if (!confirm('Remove this review video from the product?')) return;
    commit(videos.filter((_, k) => k !== i), 'Review video removed.');
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
      <small className="review-videos__help">Shown in a carousel under the written reviews on the product page, in this order. Film them portrait. Any video works: it’s converted to a small 720p file with its sound kept, at most a minute long.</small>
      {videos.length > 0 && (
        <ul className="review-videos__list">
          {videos.map((v, i) => (
            <li key={v.id || v.src} className="review-videos__item">
              <video className="review-videos__preview" src={siteUrl(v.src)} poster={v.poster ? siteUrl(v.poster) : undefined} playsInline controls preload="none" />
              <div className="review-videos__meta">
                <span>{i + 1}{v.seconds ? ` · ${Math.round(v.seconds)}s` : ''}</span>
                {v.audio === false && <span title="No sound"><VolumeX size={12} /></span>}
              </div>
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
