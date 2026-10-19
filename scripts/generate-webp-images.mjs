import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const IMAGES_DIR = path.resolve('public/images');
const targets = [
  { src: 'brand-mark-96.png', out: 'brand-mark-96.webp', quality: 90 },
  { src: 'brand-mark.png', out: 'brand-mark.webp', quality: 90 },
  { src: 'og-default.png', out: 'og-default.webp', quality: 88 },
  { src: 'logo-192.png', out: 'logo-192.webp', quality: 90 },
  { src: 'logo-512.png', out: 'logo-512.webp', quality: 90 },
];

for (const { src, out, quality } of targets) {
  const srcPath = path.join(IMAGES_DIR, src);
  const outPath = path.join(IMAGES_DIR, out);
  if (!fs.existsSync(srcPath)) continue;
  await sharp(srcPath).webp({ quality, effort: 6 }).toFile(outPath);
  const srcBytes = fs.statSync(srcPath).size;
  const outBytes = fs.statSync(outPath).size;
  console.log(`${src} (${srcBytes} B) -> ${out} (${outBytes} B)`);
}
