import sharp from 'sharp';
import fs from 'node:fs';

const mark = await sharp('public/images/brand-mark.png').resize(180, 180).png().toBuffer();
const svg = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0d17"/>
      <stop offset="100%" stop-color="#1a1b3a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <text x="300" y="300" fill="#ffffff" font-family="Inter, system-ui, sans-serif" font-size="72" font-weight="700">BriskRead</text>
  <text x="300" y="360" fill="#a8b0f2" font-family="Inter, system-ui, sans-serif" font-size="28">See it. Hear it. Finish it.</text>
  <text x="300" y="420" fill="#94a3b8" font-family="Inter, system-ui, sans-serif" font-size="22">RSVP · Bionic · PDF · private by default</text>
</svg>`);

await sharp(svg)
  .composite([{ input: mark, left: 90, top: 225 }])
  .png()
  .toFile('public/images/og-default.png');

console.log('og-default.png', fs.statSync('public/images/og-default.png').size);
