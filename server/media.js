// Site videos (the landing page film and the store page film), changed from the
// admin portal. The portal uploads the original straight to Cloud Storage
// through a one-off upload session made here, then asks the server to turn it
// into web-friendly versions: a 1080p and a 720p MP4 (H.264, no sound, small
// enough to stream) and a poster image. The result is saved in the public
// `site/media` document, which the storefront reads to pick the video.
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import http from 'node:http';
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
const PRODUCT_SECONDS = 30; // product page videos, played on demand
const PRODUCT_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
const MAX_UPLOAD = 500 * 1024 * 1024;

const bucket = () => getStorage().bucket(process.env.STORAGE_BUCKET || 'axia-jewellery.firebasestorage.app');

/** A resumable upload session the browser can PUT the original video to. */
export async function videoUploadUrl({ slot, contentType, size, origin }) {
  if (!MEDIA_SLOTS.includes(slot) && slot !== 'product') throw Object.assign(new Error('Unknown video slot'), { status: 400 });
  if (!/^video\//.test(contentType || '')) throw Object.assign(new Error('Choose a video file'), { status: 400 });
  if (!(size > 0 && size <= MAX_UPLOAD)) throw Object.assign(new Error('Videos must be under 500 MB'), { status: 400 });
  const file = `media/uploads/${slot}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const [uploadUrl] = await bucket().file(file).createResumableUpload({ origin, metadata: { contentType } });
  return { uploadUrl, path: file };
}

// ffmpeg reads the original from Storage through a short-lived local server
// that answers its range requests with the Storage SDK, so a large phone video
// never has to sit on the server's disk (which on App Hosting is memory), and
// ffmpeg itself needs no TLS certificates or Google credentials.
async function serveForFfmpeg(file) {
  const [meta] = await file.getMetadata();
  const size = Number(meta.size);
  const server = http.createServer((req, res) => {
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let start = 0, end = size - 1;
    if (m && (m[1] || m[2])) {
      if (m[1]) { start = +m[1]; if (m[2]) end = Math.min(+m[2], size - 1); } else start = Math.max(0, size - +m[2]);
      if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Content-Type': 'application/octet-stream' });
    } else {
      res.writeHead(200, { 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Content-Type': 'application/octet-stream' });
    }
    if (req.method === 'HEAD' || size === 0) return res.end();
    const stream = file.createReadStream({ start, end, validation: false });
    stream.on('error', err => { console.error('media: storage read failed', err.message); res.destroy(err); });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).on('error', reject));
  return { url: `http://127.0.0.1:${server.address().port}/original`, close: () => server.close() };
}

async function probe(input) {
  // ffmpeg prints stream info to stderr and exits non-zero without an output; that's fine here.
  const { stderr } = await run(ffmpegPath, ['-hide_banner', ...input]).catch(e => e);
  if (!/Video:/.test(stderr || '')) console.error('media: ffmpeg could not read the video:', String(stderr || '').slice(-600));
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr || '');
  const dim = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(stderr || '');
  return {
    seconds: dur ? (+dur[1]) * 3600 + (+dur[2]) * 60 + parseFloat(dur[3]) : null,
    width: dim ? +dim[1] : null, height: dim ? +dim[2] : null,
  };
}

/**
 * Original -> 1080p and 720p streaming MP4s plus a poster JPEG. `input` is the
 * ffmpeg input arguments. Two threads keep memory well under the server's
 * limit even for 4K phone footage (about 500 MB, against 750 MB+ unlimited).
 */
export async function transcode(input, dir, { hd = true, seconds = MAX_SECONDS } = {}) {
  const fit = max => `scale=w='min(${max},iw)':h='min(${max},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
  const out = { hd: hd ? path.join(dir, 'hd.mp4') : null, sd: path.join(dir, 'sd.mp4'), poster: path.join(dir, 'poster.jpg') };
  const x264 = (crf, max) => ['-c:v', 'libx264', '-preset', 'superfast', '-crf', String(crf), '-maxrate', max, '-bufsize', max.replace(/\d+/, n => n * 2),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-threads', '2'];
  const outputs = hd
    ? ['-filter_complex', `[0:v]fps=30,${fit(1920)},split=2[a][b];[b]${fit(1280)}[c]`, '-filter_threads', '1',
      '-map', '[a]', ...x264(25, '3000k'), out.hd, '-map', '[c]', ...x264(26, '1500k'), out.sd]
    : ['-filter_complex', `[0:v]fps=30,${fit(1280)}[c]`, '-filter_threads', '1', '-map', '[c]', ...x264(26, '1500k'), out.sd];
  await run(ffmpegPath, ['-v', 'error', '-y', '-threads', '2', ...input, '-t', String(seconds), '-an', ...outputs],
    { maxBuffer: 10 * 1024 * 1024, timeout: 10 * 60 * 1000 });
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
/**
 * Turns an uploaded original into the slot's new video. Site films are saved to
 * site/media; a product video (slot 'product') gets one 720p MP4 and a poster
 * under products/{productId}/, returned for the portal to save on the product.
 */
export async function processVideo({ slot, path: uploaded, by, productId }) {
  const product = slot === 'product';
  if (!MEDIA_SLOTS.includes(slot) && !product) throw Object.assign(new Error('Unknown video slot'), { status: 400 });
  if (product && !PRODUCT_ID.test(productId || '')) throw Object.assign(new Error('Save the product with a name first'), { status: 400 });
  if (typeof uploaded !== 'string' || !uploaded.startsWith(`media/uploads/${slot}-`) || uploaded.includes('..')) {
    throw Object.assign(new Error('Upload not found'), { status: 400 });
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'axia-video-'));
  const src = bucket().file(uploaded);
  let source = null;
  try {
    source = await serveForFfmpeg(src);
    const info = await probe(['-i', source.url]);
    if (!info.width) throw Object.assign(new Error('That file doesn’t look like a video we can read'), { status: 400 });
    if (product) {
      const out = await transcode(['-i', source.url], dir, { hd: false, seconds: PRODUCT_SECONDS });
      const base = `products/${productId}/video-${Date.now()}`;
      const [sd, poster] = await Promise.all([
        publish(out.sd, `${base}-720.mp4`, 'video/mp4'),
        publish(out.poster, `${base}-poster.jpg`, 'image/jpeg'),
      ]);
      const after = await probe(['-i', out.sd]);
      return { video: sd.url, videoPoster: poster.url, sizeBytes: sd.size, seconds: after.seconds,
        trimmed: !!(info.seconds && info.seconds > PRODUCT_SECONDS + 0.5) };
    }
    const out = await transcode(['-i', source.url], dir);
    const base = `media/${slot}/${Date.now()}`;
    const [hd, sd, poster] = await Promise.all([
      publish(out.hd, `${base}-1080.mp4`, 'video/mp4'),
      publish(out.sd, `${base}-720.mp4`, 'video/mp4'),
      publish(out.poster, `${base}-poster.jpg`, 'image/jpeg'),
    ]);
    const after = await probe(['-i', out.hd]);
    const entry = {
      src: hd.url, mobileSrc: sd.url, poster: poster.url,
      sizeBytes: hd.size, mobileSizeBytes: sd.size, seconds: after.seconds, width: after.width, height: after.height,
      originalSeconds: info.seconds, trimmed: !!(info.seconds && info.seconds > MAX_SECONDS + 0.5),
      updatedAt: FieldValue.serverTimestamp(), by,
    };
    await db.doc('site/media').set({ [slot]: entry }, { merge: true });
    return { ...entry, updatedAt: Date.now() };
  } finally {
    if (source) source.close();
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
