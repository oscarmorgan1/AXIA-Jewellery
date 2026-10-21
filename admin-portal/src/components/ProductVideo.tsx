import { useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { doc, getDoc, serverTimestamp, updateDoc, deleteField } from 'firebase/firestore';
import { db, siteUrl } from '../firebase';
import { uploadVideo, type VideoStage } from '../lib/video';
import VideoProgress from './VideoProgress';

interface Made { video: string; videoPoster: string; sizeBytes: number; seconds: number | null; trimmed: boolean; saved: boolean }

/**
 * The product page video. Uploads are converted by the server to one light
 * 720p MP4 (no sound, at most 30 seconds) plus a poster; the product page only
 * loads it when someone taps the video thumbnail. The server saves it on the
 * product as soon as it's converted (and removing it saves straight away too),
 * so it doesn't depend on pressing Save.
 */
export default function ProductVideo({ productId, video, poster, onChange, onError }: {
  productId: string; video?: string; poster?: string;
  onChange: (v: { video?: string; videoPoster?: string }) => void; onError: (msg: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<VideoStage>('');
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');

  async function upload(file: File) {
    if (!productId) return onError('Give the product a name first, so the video is filed under its id.');
    setNote('');
    try {
      const r = await uploadVideo<Made>('product', file, { stage: setStage, progress: setProgress }, { productId });
      onChange({ video: r.video, videoPoster: r.videoPoster });
      setNote(`${r.saved ? 'Saved to the product' : 'Converted; save the product to publish it'}: ${(r.sizeBytes / 1048576).toFixed(1)} MB${r.seconds ? `, ${Math.round(r.seconds)}s` : ''}${r.trimmed ? ', cut to the first 30 seconds' : ''}.`);
    } catch (e) { onError((e as Error).message); } finally { setStage(''); if (input.current) input.current.value = ''; }
  }

  async function remove() {
    if (!confirm('Remove this video from the product?')) return;
    try {
      const ref = doc(db, 'products', productId);
      if (productId && (await getDoc(ref)).exists()) await updateDoc(ref, { video: deleteField(), videoPoster: deleteField(), updatedAt: serverTimestamp() });
      onChange({ video: undefined, videoPoster: undefined });
      setNote('Video removed.');
    } catch (e) { onError(`Couldn’t remove the video: ${(e as Error).message}`); }
  }

  return (
    <div className="video-slot">
      {video
        ? <video className="video-slot__preview" style={{ aspectRatio: '1 / 1' }} src={siteUrl(video)} poster={poster ? siteUrl(poster) : undefined} muted loop playsInline controls preload="none" />
        : <div className="video-slot__preview video-slot__empty" style={{ aspectRatio: '1 / 1' }}>No video</div>}
      <div className="video-slot__body">
        <small>Shown as the last thumbnail on the product page and only loaded when tapped. Any video works: it’s converted to a small 720p file with no sound, at most 30 seconds.</small>
        {note && <small>{note}</small>}
        <VideoProgress stage={stage} progress={progress} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,video/*" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          <button type="button" className="btn btn--sm btn--primary" onClick={() => input.current?.click()} disabled={!!stage}><Upload size={14} /> {video ? 'Replace video' : 'Upload video'}</button>
          {video && <button type="button" className="btn btn--sm" disabled={!!stage} onClick={remove}><Trash2 size={14} /> Remove</button>}
        </div>
      </div>
    </div>
  );
}
