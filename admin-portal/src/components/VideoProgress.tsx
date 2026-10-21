import type { VideoStage } from '../lib/video';

export default function VideoProgress({ stage, progress }: { stage: VideoStage; progress: number }) {
  if (!stage) return null;
  return (
    <div className="video-slot__progress">
      <div className="video-slot__bar"><i style={{ width: `${stage === 'uploading' ? Math.round(progress * 100) : 100}%` }} className={stage === 'converting' ? 'pulse' : ''} /></div>
      <small>{stage === 'uploading' ? `Uploading ${Math.round(progress * 100)}%` : 'Converting for the web. This takes up to a minute, keep this page open.'}</small>
    </div>
  );
}
