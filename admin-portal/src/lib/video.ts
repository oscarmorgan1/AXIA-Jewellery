import { adminApi } from './api';

/** PUT the file to the upload session, reporting progress (0 to 1). */
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

export type VideoStage = '' | 'uploading' | 'converting';

/**
 * Uploads a video straight to Cloud Storage, then has the server convert it for
 * the web (see server/media.js). Returns what the server made.
 */
export async function uploadVideo<T>(slot: 'store' | 'landing' | 'product', file: File,
  on: { stage: (s: VideoStage) => void; progress: (p: number) => void }, extra: Record<string, string> = {}): Promise<T> {
  if (!file.type.startsWith('video/')) throw new Error('Choose a video file (MP4 or MOV).');
  on.stage('uploading'); on.progress(0);
  const { uploadUrl, path } = await adminApi<{ uploadUrl: string; path: string }>('/media/upload-url', { slot, contentType: file.type, size: file.size });
  await put(uploadUrl, file, on.progress);
  on.stage('converting');
  return adminApi<T>('/media/video', { slot, path, ...extra });
}
