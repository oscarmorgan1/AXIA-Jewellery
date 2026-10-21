import { useRef, useState } from 'react';
import { Film, RotateCcw, Upload } from 'lucide-react';
import { siteUrl } from '../firebase';
import { adminApi } from '../lib/api';
import { useSiteMedia } from '../lib/data';
import { uploadVideo, type VideoStage } from '../lib/video';
import { useToast } from './Toast';
import VideoProgress from './VideoProgress';
import type { SiteVideo } from '../types';

const DEFAULT: SiteVideo = { src: 'assets/video/axia-hero.mp4?v=2', mobileSrc: 'assets/video/axia-hero-720.mp4?v=2', poster: 'assets/video/axia-hero-poster.jpg', sizeBytes: 3725463, mobileSizeBytes: 1858779 };
const mb = (n?: number) => (n ? `${(n / 1048576).toFixed(1)} MB` : '–');

/**
 * The site film, shown on the waitlist (home) page and the store page. Stored
 * as site/media.store; the storefront uses it for every page's film. The server
 * converts each upload to light 1080p and 720p versions so pages stay fast.
 */
export default function VideosCard() {
  const { data, error: loadError } = useSiteMedia();
  const video = data.store;
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<VideoStage>('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const toast = useToast();
  const v = video?.src ? video : DEFAULT;

  async function upload(file: File) {
    setError('');
    try {
      const r = await uploadVideo<SiteVideo & { trimmed?: boolean }>('store', file, { stage: setStage, progress: setProgress });
      // Older uploads may have set a separate waitlist film; one film now covers both pages.
      if (data.landing) await adminApi('/media/reset', { slot: 'landing' }).catch(() => {});
      toast.show(`Site film updated${r.trimmed ? ' (cut to the first 20 seconds)' : ''}`);
    } catch (e) { setError((e as Error).message); } finally { setStage(''); if (input.current) input.current.value = ''; }
  }

  async function reset() {
    if (!confirm('Put the original AXIA film back on the waitlist and store pages?')) return;
    try {
      await Promise.all([adminApi('/media/reset', { slot: 'store' }), data.landing ? adminApi('/media/reset', { slot: 'landing' }) : null]);
      toast.show('Back to the original film');
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="card">
      <div className="card__head">
        <div><h2><Film size={18} style={{ verticalAlign: -3, marginRight: 6 }} />Site film</h2>
          <div className="card__sub">One video for the waitlist (home) page and the store page. Upload any video and it’s converted for the web: sound removed, at most 20 seconds, a 1080p version for computers and a smaller 720p one for phones. Visitors only load it when it’s about to be seen.</div></div>
      </div>
      {loadError && <div className="notice notice--error">{loadError.message}</div>}
      <div className="video-slot">
        <video className="video-slot__preview" src={siteUrl(v.mobileSrc || v.src)} poster={v.poster ? siteUrl(v.poster) : undefined} muted loop playsInline controls preload="none" />
        <div className="video-slot__body">
          <b>{video?.src ? 'Your uploaded film' : 'Original AXIA film'}</b>
          <small>{video?.src ? `Uploaded ${video.updatedAt ? video.updatedAt.toDate().toLocaleDateString('en-AU') : ''}${video.by ? ` by ${video.by}` : ''} · ` : ''}
            {mb(v.sizeBytes)} desktop, {mb(v.mobileSizeBytes)} phone{video?.seconds ? ` · ${Math.round(video.seconds)}s` : ''}</small>
          {error && <div className="notice notice--error">{error}</div>}
          <VideoProgress stage={stage} progress={progress} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,video/*" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
            <button className="btn btn--sm btn--primary" onClick={() => input.current?.click()} disabled={!!stage}><Upload size={14} /> Upload new video</button>
            {(video?.src || data.landing?.src) && <button className="btn btn--sm" onClick={reset} disabled={!!stage}><RotateCcw size={14} /> Use original</button>}
            <a className="btn btn--sm btn--ghost" href={siteUrl('/')} target="_blank" rel="noreferrer">Waitlist page</a>
            <a className="btn btn--sm btn--ghost" href={siteUrl('/store')} target="_blank" rel="noreferrer">Store page</a>
          </div>
        </div>
      </div>
      {toast.node}
    </div>
  );
}
