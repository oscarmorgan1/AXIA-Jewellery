import { useRef, useState } from 'react';
import { Film, RotateCcw, Upload } from 'lucide-react';
import { siteUrl } from '../firebase';
import { adminApi } from '../lib/api';
import { useSiteMedia } from '../lib/data';
import { useToast } from './Toast';
import type { SiteVideo } from '../types';

const SLOTS: { key: 'landing' | 'store'; label: string; where: string; page: string }[] = [
  { key: 'landing', label: 'Waitlist page film', where: 'The full-width video on the home (waitlist) page.', page: '/' },
  { key: 'store', label: 'Store page film', where: 'The “Made for motion” banner on the store page.', page: '/store' },
];
const DEFAULT: SiteVideo = { src: 'assets/video/axia-hero.mp4?v=2', mobileSrc: 'assets/video/axia-hero-720.mp4?v=2', poster: 'assets/video/axia-hero-poster.jpg', sizeBytes: 3725463, mobileSizeBytes: 1858779 };
const mb = (n?: number) => (n ? `${(n / 1048576).toFixed(1)} MB` : '–');

/** PUT the file to the upload session, reporting progress. */
function put(url: string, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', file.type);
    x.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Upload failed (${x.status})`)));
    x.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    x.send(file);
  });
}

function Slot({ slot, video }: { slot: typeof SLOTS[number]; video?: SiteVideo }) {
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<'' | 'uploading' | 'converting'>('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const toast = useToast();
  const v = video?.src ? video : DEFAULT;

  async function upload(file: File) {
    setError(''); setProgress(0);
    if (!file.type.startsWith('video/')) return setError('Choose a video file (MP4 or MOV).');
    try {
      setStage('uploading');
      const { uploadUrl, path } = await adminApi<{ uploadUrl: string; path: string }>('/media/upload-url', { slot: slot.key, contentType: file.type, size: file.size });
      await put(uploadUrl, file, setProgress);
      setStage('converting');
      const r = await adminApi<SiteVideo & { trimmed?: boolean }>('/media/video', { slot: slot.key, path });
      toast.show(`${slot.label} updated${r.trimmed ? ' (cut to the first 20 seconds)' : ''}`);
    } catch (e) { setError((e as Error).message); } finally { setStage(''); if (input.current) input.current.value = ''; }
  }

  async function reset() {
    if (!confirm(`Put the original AXIA film back on the ${slot.label.toLowerCase()}?`)) return;
    try { await adminApi('/media/reset', { slot: slot.key }); toast.show('Back to the original film'); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="video-slot">
      <video className="video-slot__preview" src={siteUrl(v.mobileSrc || v.src)} poster={v.poster ? siteUrl(v.poster) : undefined} muted loop playsInline controls preload="none" />
      <div className="video-slot__body">
        <b>{slot.label}</b>
        <small>{slot.where}</small>
        <small>{video?.src ? `Uploaded ${video.updatedAt ? video.updatedAt.toDate().toLocaleDateString('en-AU') : ''}${video.by ? ` by ${video.by}` : ''}` : 'Original AXIA film'}
          {' · '}{mb(v.sizeBytes)} desktop, {mb(v.mobileSizeBytes)} phone{video?.seconds ? ` · ${Math.round(video.seconds)}s` : ''}</small>
        {error && <div className="notice notice--error">{error}</div>}
        {stage && (
          <div className="video-slot__progress">
            <div className="video-slot__bar"><i style={{ width: `${stage === 'uploading' ? Math.round(progress * 100) : 100}%` }} className={stage === 'converting' ? 'pulse' : ''} /></div>
            <small>{stage === 'uploading' ? `Uploading ${Math.round(progress * 100)}%` : 'Converting for the web. This takes up to a minute, keep this page open.'}</small>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,video/*" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          <button className="btn btn--sm btn--primary" onClick={() => input.current?.click()} disabled={!!stage}><Upload size={14} /> Upload new video</button>
          {video?.src && <button className="btn btn--sm" onClick={reset} disabled={!!stage}><RotateCcw size={14} /> Use original</button>}
          <a className="btn btn--sm btn--ghost" href={siteUrl(slot.page)} target="_blank" rel="noreferrer">View on site</a>
        </div>
      </div>
      {toast.node}
    </div>
  );
}

/** Upload the site's hero films. The server converts each upload to light 1080p and 720p versions so pages stay fast. */
export default function VideosCard() {
  const { data, error } = useSiteMedia();
  return (
    <div className="card">
      <div className="card__head">
        <div><h2><Film size={18} style={{ verticalAlign: -3, marginRight: 6 }} />Videos</h2>
          <div className="card__sub">Upload any video and it’s converted for the web: sound removed, at most 20 seconds, a 1080p version for computers and a smaller 720p one for phones. Visitors only load it when it’s about to be seen.</div></div>
      </div>
      {error && <div className="notice notice--error">{error.message}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {SLOTS.map(s => <Slot key={s.key} slot={s} video={data[s.key]} />)}
      </div>
    </div>
  );
}
