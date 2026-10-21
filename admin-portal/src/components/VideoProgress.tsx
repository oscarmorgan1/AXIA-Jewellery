import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { VideoStage } from '../lib/video';

/**
 * Full-screen loader while a video uploads and converts. It covers the portal so
 * nothing else can be clicked, and the browser asks before leaving or reloading
 * the page, since closing it would stop the upload.
 */
export default function VideoProgress({ stage, progress }: { stage: VideoStage; progress: number }) {
  useEffect(() => {
    if (!stage) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [stage]);
  if (!stage) return null;
  const pct = Math.round(progress * 100);
  return createPortal(
    <div className="video-busy" role="alertdialog" aria-modal="true" aria-live="polite" aria-label="Processing video">
      <div className="video-busy__box">
        <span className="video-busy__spin" aria-hidden="true" />
        <b>{stage === 'uploading' ? `Uploading video… ${pct}%` : 'Converting for the web…'}</b>
        <div className="video-slot__bar"><i style={{ width: `${stage === 'uploading' ? pct : 100}%` }} className={stage === 'converting' ? 'pulse' : ''} /></div>
        <small>{stage === 'uploading' ? 'Keep this page open.' : 'This takes up to a minute. Keep this page open; it saves automatically when done.'}</small>
      </div>
    </div>,
    document.body,
  );
}
