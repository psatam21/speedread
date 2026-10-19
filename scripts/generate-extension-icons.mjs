/**
 * Extension icons from the site's brand mark (public/images/brand-mark.png, 1024px).
 * Toolbar sizes are full bleed for legibility. The 128px store icon follows the
 * Chrome Web Store guideline: 96px artwork centred with 16px transparent padding.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public', 'images', 'brand-mark.png');
const outDir = path.join(root, 'chrome-extension', 'icons');

for (const size of [16, 32, 48]) {
  await sharp(source).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(path.join(outDir, `icon${size}.png`));
}

const art = await sharp(source).resize(96, 96, { kernel: 'lanczos3' }).png().toBuffer();
await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: art, left: 16, top: 16 }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(outDir, 'icon128.png'));

console.log(`Icons written to ${outDir}`);
