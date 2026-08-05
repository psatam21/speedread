// One-off: brand-mark.png was exported with baked-in rounded corners on an
// opaque white canvas, so browsers show white slivers when they apply their
// own tab-icon rounding on top. Flood-fill white starting from the four
// image corners (bounded — never touches the white bolt glyph, since it
// doesn't connect to the edges) to punch real alpha transparency there.
import sharp from 'sharp';

const SRC = 'public/images/brand-mark.png';
const WHITE_THRESHOLD = 235;

async function run() {
  const img = sharp(SRC).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const isWhite = (i) => data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD;
  const visited = new Uint8Array(width * height);
  const stack = [];
  const pushIfWhite = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    const i = p * channels;
    if (!isWhite(i)) return;
    visited[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < width; x++) { pushIfWhite(x, 0); pushIfWhite(x, height - 1); }
  for (let y = 0; y < height; y++) { pushIfWhite(0, y); pushIfWhite(width - 1, y); }

  let cleared = 0;
  while (stack.length) {
    const p = stack.pop();
    const i = p * channels;
    data[i + 3] = 0;
    cleared++;
    const x = p % width;
    const y = (p - x) / width;
    pushIfWhite(x + 1, y);
    pushIfWhite(x - 1, y);
    pushIfWhite(x, y + 1);
    pushIfWhite(x, y - 1);
  }

  console.log(`Cleared ${cleared} corner pixels (${((cleared / (width * height)) * 100).toFixed(1)}%)`);

  const clean = sharp(data, { raw: { width, height, channels } }).png();
  await clean.clone().toFile(SRC);

  // Browser favicons/manifest icons: transparent corners (browsers apply
  // their own rounding on top, so real alpha is correct here).
  const transparentOutputs = [
    ['public/favicon.png', 32],
    ['public/images/favicon-16.png', 16],
    ['public/images/favicon-32.png', 32],
    ['public/images/favicon-48.png', 48],
    ['public/images/logo-192.png', 192],
    ['public/images/logo-512.png', 512],
  ];
  for (const [out, size] of transparentOutputs) {
    await clean.clone().resize(size, size).png().toFile(out);
    console.log('wrote', out, size);
  }

  // apple-touch-icon: iOS ignores alpha and fills transparent pixels with
  // black, then applies its own corner mask — flatten onto a background
  // that matches the icon's own edge color instead of leaving it transparent.
  await sharp(data, { raw: { width, height, channels } })
    .flatten({ background: '#4a3f9e' })
    .resize(180, 180)
    .png()
    .toFile('public/images/apple-touch-icon.png');
  console.log('wrote public/images/apple-touch-icon.png 180 (flattened)');
}

run();
