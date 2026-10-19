/**
 * Paper and Pen brand assets: recolours the master mark (ink tile, highlighter glyph)
 * and derives every favicon / app-icon size plus favicon.ico from it.
 * Usage: node scripts/generate-brand-assets.mjs  (then: node scripts/make-og.mjs && node scripts/generate-webp-images.mjs)
 */
import sharp from 'sharp';
import fs from 'node:fs';

const INK = [30, 27, 22]; // #1e1b16
const WASH = [255, 238, 158]; // #ffee9e
const master = 'public/images/brand-mark.png';

// Map brightness to ink -> wash: the white glyph becomes highlighter yellow, the tile becomes ink.
// Only recolour the original indigo master; once it is ink, re-runs just re-derive the sizes.
const { data, info } = await sharp(master).resize(1024, 1024).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const centre = (512 * 1024 + 140) * 4; // a tile pixel left of the glyph
const alreadyInk = Math.abs(data[centre] - INK[0]) < 12 && Math.abs(data[centre + 2] - INK[2]) < 12;
if (!alreadyInk) for (let i = 0; i < data.length; i += 4) {
  const w = Math.min(data[i], data[i + 1], data[i + 2]) / 255;
  const t = Math.pow(Math.max(0, (w - 0.35) / 0.65), 1.4);
  for (let k = 0; k < 3; k++) data[i + k] = Math.round(INK[k] * (1 - t) + WASH[k] * t);
}
const ink = await sharp(data, { raw: info }).png().toBuffer();
fs.writeFileSync(master, await sharp(ink).png({ compressionLevel: 9 }).toBuffer());

const sizes = {
  'public/images/brand-mark-96.png': 96,
  'public/images/logo-192.png': 192,
  'public/images/logo-512.png': 512,
  'public/images/apple-touch-icon.png': 180,
};
for (const [out, px] of Object.entries(sizes)) {
  await sharp(ink).resize(px, px).png({ compressionLevel: 9, palette: px <= 96 }).toFile(out);
}

// The SVG favicon is a separate hand-drawn vector: swap its fills.
const svgPath = 'public/favicon.svg';
fs.writeFileSync(svgPath, fs.readFileSync(svgPath, 'utf8')
  .replace(/<defs>[\s\S]*?<\/defs>\s*/, '')
  .replace('fill="url(#br-bg)"', 'fill="#1e1b16"')
  .replace('<g fill="#ffffff">', '<g fill="#ffee9e">'));

// Tiny icons come from that simpler vector: the detailed raster mark smears below ~64px.
const vector = fs.readFileSync(svgPath);
const small = (px) => sharp(vector, { density: 72 * (px / 128) * 8 }).resize(px, px).png().toBuffer();
for (const [out, px] of [['public/images/favicon-16.png', 16], ['public/images/favicon-32.png', 32], ['public/images/favicon-48.png', 48], ['public/favicon.png', 32]]) {
  fs.writeFileSync(out, await small(px));
}

// favicon.ico with embedded PNG layers (valid since Windows Vista; every current browser reads it).
const layers = await Promise.all([16, 32, 48].map(small));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(layers.length, 4);
let offset = 6 + 16 * layers.length;
const dir = layers.map((png, i) => {
  const px = [16, 32, 48][i];
  const e = Buffer.alloc(16);
  e.writeUInt8(px, 0); e.writeUInt8(px, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12);
  offset += png.length;
  return e;
});
fs.writeFileSync('public/favicon.ico', Buffer.concat([header, ...dir, ...layers]));

console.log('brand assets regenerated:', Object.keys(sizes).length + 6, 'files');
