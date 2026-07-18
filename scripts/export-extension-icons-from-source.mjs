/**
 * Resize chrome-extension/icons/source-imagine.jpg (or .png) → icon16/32/48/128.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'chrome-extension', 'icons');
const candidates = ['source-imagine.png', 'source-imagine.jpg', 'source-imagine.webp'];
const source = candidates.map((n) => path.join(iconsDir, n)).find((p) => fs.existsSync(p));

if (!source) {
  console.error('No source-imagine.* in chrome-extension/icons/');
  process.exit(1);
}

const sizes = [16, 32, 48, 128];

// Slight center crop if the model added margin; cover into square
const pipeline = () =>
  sharp(source)
    .rotate() // respect EXIF
    .resize(512, 512, { fit: 'cover', position: 'centre' });

await pipeline().png().toFile(path.join(iconsDir, 'icon-master-512.png'));

for (const size of sizes) {
  const out = path.join(iconsDir, `icon${size}.png`);
  await sharp(source)
    .rotate()
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log('wrote', out, fs.statSync(out).size, 'bytes');
}

console.log('source:', source);
