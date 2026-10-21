// Site videos (the landing page film and the store page film), changed from the
// admin portal. The portal uploads the original straight to Cloud Storage
// through a one-off upload session made here, then asks the server to turn it
// into web-friendly versions: a 1080p and a 720p MP4 (H.264, no sound, small
// enough to stream) and a poster image. The result is saved in the public
// `site/media` document, which the storefront reads to pick the video.
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue } from 'firebase-admin/firestore';
import ffmpegPath from 'ffmpeg-static';
import { db } from './services.js';

const run = promisify(execFile);
export const MEDIA_SLOTS = ['landing', 'store'];
const MAX_SECONDS = 20; // a looping hero film; anything longer is cut (and conversion stays quick)
const MAX_UPLOAD = 500 * 1024 * 1024;

const bucket = () => getStorage().bucket(process.env.STORAGE_BUCKET || 'axia-jewellery.firebasestorage.app');

/** A resumable upload session the browser can PUT the original video to. */
export async function videoUploadUrl({ slot, contentType, size, origin }) {
  if (!MEDIA_SLOTS.includes(slot)) throw Object.assign(new Error('Unknown video slot'), { status: 400 });
  if (!/^video\//.test(contentType || '')) throw Object.assign(new Error('Choose a video file'), { status: 400 });
  if (!(size > 0 && size <= MAX_UPLOAD)) throw Object.assign(new Error('Videos must be under 500 MB'), { status: 400 });
  const file = `media/uploads/${slot}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const [uploadUrl] = await bucket().file(file).createResumableUpload({ origin, metadata: { contentType } });
  return { uploadUrl, path: file };
}

async function probe(file) {
  // ffmpeg prints stream info to stderr and exits non-zero without an output; that's fine here.
  const { stderr } = await run(ffmpegPath, ['-hide_banner', '-i', file]).catch(e => e);
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr || '');
  const dim = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(stderr || '');
  return {
    seconds: dur ? (+dur[1]) * 3600 + (+dur[2]) * 60 + parseFloat(dur[3]) : null,
    width: dim ? +dim[1] : null, height: dim ? +dim[2] : null,
  };
}

/** Original -> 1080p and 720p streaming MP4s plus a poster JPEG. */
export async function transcode(input, dir) {
  const fit = max => `scale=w='min(${max},iw)':h='min(${max},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
  const out = { hd: path.join(dir, 'hd.mp4'), sd: path.join(dir, 'sd.mp4'), poster: path.join(dir, 'poster.jpg') };
  const x264 = (crf, max) => ['-c:v', 'libx264', '-preset', 'superfast', '-crf', String(crf), '-maxrate', max, '-bufsize', max.replace(/\d+/, n => n * 2),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  await run(ffmpegPath, ['-v', 'error', '-y', '-i', input, '-t', String(MAX_SECONDS), '-an',
    '-filter_complex', `[0:v]fps=30,${fit(1920)},split=2[a][b];[b]${fit(1280)}[c]`,
    '-map', '[a]', ...x264(25, '3000k'), out.hd,
    '-map', '[c]', ...x264(26, '1500k'), out.sd], { maxBuffer: 10 * 1024 * 1024, timeout: 10 * 60 * 1000 });
  await run(ffmpegPath, ['-v', 'error', '-y', '-ss', '0.3', '-i', out.sd, '-frames:v', '1', '-q:v', '4', out.poster]);
  return out;
}

async function publish(local, dest, contentType) {
  const token = randomUUID();
  const b = bucket();
  await b.upload(local, {
    destination: dest,
    metadata: { contentType, cacheControl: 'public, max-age=31536000, immutable', metadata: { firebaseStorageDownloadTokens: token } },
  });
  const size = (await fs.stat(local)).size;
  return { url: `https://firebasestorage.googleapis.com/v0/b/${b.name}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`, size };
}

/** Turns an uploaded original into the slot's new video and saves it to site/media. */
export async function processVideo({ slot, path: uploaded, by }) {
  if (!MEDIA_SLOTS.includes(slot)) throw Object.assign(new Error('Unknown video slot'), { status: 400 });
  if (typeof uploaded !== 'string' || !uploaded.startsWith(`media/uploads/${slot}-`) || uploaded.includes('..')) {
    throw Object.assign(new Error('Upload not found'), { status: 400 });
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'axia-video-'));
  const src = bucket().file(uploaded);
  try {
    const input = path.join(dir, 'original');
    await src.download({ destination: input });
    const info = await probe(input);
    if (!info.width) throw Object.assign(new Error('That file doesn’t look like a video we can read'), { status: 400 });
    const out = await transcode(input, dir);
    const base = `media/${slot}/${Date.now()}`;
    const [hd, sd, poster] = await Promise.all([
      publish(out.hd, `${base}-1080.mp4`, 'video/mp4'),
      publish(out.sd, `${base}-720.mp4`, 'video/mp4'),
      publish(out.poster, `${base}-poster.jpg`, 'image/jpeg'),
    ]);
    const after = await probe(out.hd);
    const entry = {
      src: hd.url, mobileSrc: sd.url, poster: poster.url,
      sizeBytes: hd.size, mobileSizeBytes: sd.size, seconds: after.seconds, width: after.width, height: after.height,
      originalSeconds: info.seconds, trimmed: !!(info.seconds && info.seconds > MAX_SECONDS + 0.5),
      updatedAt: FieldValue.serverTimestamp(), by,
    };
    await db.doc('site/media').set({ [slot]: entry }, { merge: true });
    return { ...entry, updatedAt: Date.now() };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
    await src.delete().catch(() => {}); // the original isn't needed once converted
  }
}

/** Back to the built-in video for that slot. */
export async function resetVideo(slot) {
  if (!MEDIA_SLOTS.includes(slot)) throw Object.assign(new Error('Unknown video slot'), { status: 400 });
  await db.doc('site/media').set({ [slot]: FieldValue.delete() }, { merge: true });
  return { ok: true };
}
