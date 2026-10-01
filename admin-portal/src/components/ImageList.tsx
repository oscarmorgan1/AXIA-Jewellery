import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from 'lucide-react';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { siteUrl, storage } from '../firebase';

/** Ordered list of image paths/URLs with upload to Firebase Storage (products/{id}/...). */
export default function ImageList({ productId, images, onChange, onError }: {
  productId: string; images: string[]; onChange: (next: string[]) => void; onError: (msg: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [path, setPath] = useState('');

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (!productId) return onError('Give the product a name first, so photos are filed under its id.');
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        const safe = f.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
        const r = ref(storage, `products/${productId}/${Date.now()}-${safe}`);
        await uploadBytes(r, f, { contentType: f.type, cacheControl: 'public, max-age=31536000' });
        urls.push(await getDownloadURL(r));
      }
      onChange([...images, ...urls]);
    } catch (e) {
      onError(`Upload failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div>
      <div className="images">
        {images.map((src, i) => (
          <div className="image-tile" key={src + i} title={src}>
            <img src={siteUrl(src)} alt="" loading="lazy" />
            <div className="tile-actions">
              <button type="button" onClick={() => move(i, -1)} aria-label="Move left"><ArrowLeft size={14} /></button>
              <button type="button" onClick={() => move(i, 1)} aria-label="Move right"><ArrowRight size={14} /></button>
              <button type="button" onClick={() => onChange(images.filter((_, k) => k !== i))} aria-label="Remove"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        <button type="button" className="image-tile upload-tile" onClick={() => input.current?.click()} disabled={busy}>
          <span><ImagePlus size={22} /><br />{busy ? 'Uploading…' : 'Upload photos'}</span>
        </button>
      </div>
      <input ref={input} type="file" accept="image/*,video/mp4" multiple hidden onChange={e => upload(e.target.files)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input className="input" placeholder="…or add a site path, e.g. assets/img/products/x/1.jpg" value={path} onChange={e => setPath(e.target.value)} />
        <button type="button" className="btn btn--sm" disabled={!path.trim()} onClick={() => { onChange([...images, path.trim()]); setPath(''); }}>Add</button>
      </div>
    </div>
  );
}
