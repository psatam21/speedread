import sharp from 'sharp';
import fs from 'node:fs';

// Paper and Pen share card: cream page, ink serif headline, highlighter wash, ink logo tile.
const mark = await sharp('public/images/brand-mark.png').resize(150, 150).png().toBuffer();
const svg = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#f6f2e9"/>
  <rect x="0" y="0" width="1200" height="14" fill="#1e1b16"/>
  <text x="90" y="300" fill="#a3290f" font-family="Helvetica, Arial, sans-serif" font-size="26" letter-spacing="3">FREE ONLINE SPEED READER</text>
  <text x="90" y="400" fill="#1e1b16" font-family="Georgia, 'Times New Roman', serif" font-size="88">See it. Hear it.</text>
  <rect x="84" y="430" width="420" height="96" fill="#ffee9e"/>
  <text x="90" y="505" fill="#1e1b16" font-family="Georgia, 'Times New Roman', serif" font-size="88">Finish it.</text>
  <text x="1110" y="580" text-anchor="end" fill="#5c5548" font-family="Georgia, 'Times New Roman', serif" font-size="30">briskread.com</text>
</svg>`);

await sharp(svg)
  .composite([{ input: mark, left: 960, top: 90 }])
  .png({ compressionLevel: 9 })
  .toFile('public/images/og-default.png');

console.log('og-default.png', fs.statSync('public/images/og-default.png').size);
