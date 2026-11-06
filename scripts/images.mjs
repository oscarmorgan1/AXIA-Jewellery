// Makes web-sized WebP copies of the site photos: for every JPEG/PNG under
// assets/img, a 600px and a 1200px wide version next to it (1.jpg -> 1-600.webp,
// 1-1200.webp). Pages ask for these through AXIA_IMG() in catalogue.js, and the
// server falls back to the original if one is missing, so a photo added
// without running this still shows. Run after adding photos:
//   npm run images            (only makes what's missing)
//   npm run images -- --force (remakes everything)
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'assets', 'img');
const WIDTHS = [600, 1200];
const force = process.argv.includes('--force');

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(jpe?g|png)$/i.test(e.name) && !/logo/i.test(e.name)) yield p; // the logo stays a crisp PNG
  }
}

const exists = p => fs.access(p).then(() => true, () => false);
let made = 0, before = 0, after = 0;
for await (const file of walk(ROOT)) {
  const base = file.replace(/\.(jpe?g|png)$/i, '');
  const size = (await fs.stat(file)).size;
  for (const w of WIDTHS) {
    const out = `${base}-${w}.webp`;
    if (!force && await exists(out)) continue;
    await sharp(file).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(out);
    made++;
    if (w === 600) { before += size; after += (await fs.stat(out)).size; }
  }
}
console.log(made ? `✓ made ${made} WebP files` + (before ? ` (600px versions ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB)` : '') : '✓ all WebP versions already exist');
