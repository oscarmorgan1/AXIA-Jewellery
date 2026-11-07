// Makes the admin portal's home screen icons (admin-portal/public/icons) from
// the AXIA mark. Run again only if the mark changes: `node scripts/admin-icons.mjs`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../admin-portal/public/icons');

// The favicon's A on obsidian. `scale` is how much of the square the mark fills:
// maskable icons keep it inside the middle 80% so Android's crop never clips it.
const mark = scale => {
  const s = 32 * scale, o = (32 - s) / 2, k = scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#111315"/>`
    + `<g fill="#F4F1EA" transform="translate(${o} ${o}) scale(${k})"><polygon points="16,5 6,27 9.5,27"/>`
    + `<polygon points="16,5 22.5,27 26,27"/><rect x="9" y="20.4" width="14" height="1.7"/></g></svg>`;
};

const icons = [
  ['icon-192.png', 192, 0.8],
  ['icon-512.png', 512, 0.8],
  ['maskable-512.png', 512, 0.6],
  ['apple-touch-icon.png', 180, 0.7],
];
for (const [name, size, scale] of icons) {
  await sharp(Buffer.from(mark(scale)), { density: size * 3 }).resize(size, size).png().toFile(path.join(out, name));
  console.log('wrote', name);
}
