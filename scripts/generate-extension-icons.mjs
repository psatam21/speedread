/**
 * Generate SpeedRead extension icons (16/32/48/128 PNG).
 * Prefers sharp; falls back to a minimal pure-PNG writer if sharp is missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'chrome-extension', 'icons');
const sizes = [16, 32, 48, 128];

fs.mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Simple solid indigo tile + white bolt approximation */
function makePng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 4;
      // rounded rect background #4f46e5
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      const pad = 0.06;
      const inBox = nx > pad && nx < 1 - pad && ny > pad && ny < 1 - pad;
      // lightning bolt polygon (normalized)
      const bolt =
        (nx > 0.42 && nx < 0.62 && ny > 0.18 && ny < 0.55) ||
        (nx > 0.35 && nx < 0.58 && ny > 0.48 && ny < 0.58) ||
        (nx > 0.38 && nx < 0.58 && ny > 0.52 && ny < 0.82);
      if (inBox && bolt) {
        raw[i] = 255;
        raw[i + 1] = 255;
        raw[i + 2] = 255;
        raw[i + 3] = 255;
      } else if (inBox) {
        raw[i] = 79;
        raw[i + 1] = 70;
        raw[i + 2] = 229;
        raw[i + 3] = 255;
      } else {
        raw[i] = 0;
        raw[i + 1] = 0;
        raw[i + 2] = 0;
        raw[i + 3] = 0;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function withSharp() {
  const sharp = (await import('sharp')).default;
  const svg = (s) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 128 128">
  <rect x="8" y="8" width="112" height="112" rx="24" fill="#4f46e5"/>
  <path d="M72 24L44 72h22l-8 32 36-56H72l8-24z" fill="#ffffff"/>
</svg>`;
  for (const size of sizes) {
    const out = path.join(outDir, `icon${size}.png`);
    await sharp(Buffer.from(svg(size))).png().toFile(out);
    console.log('wrote', out);
  }
}

async function main() {
  try {
    await withSharp();
  } catch (err) {
    console.warn('sharp unavailable — using built-in PNG writer:', err?.message || err);
    for (const size of sizes) {
      const out = path.join(outDir, `icon${size}.png`);
      fs.writeFileSync(out, makePng(size));
      console.log('wrote', out);
    }
  }
}

main();
