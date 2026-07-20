import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const globalCss = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');

assert.match(globalCss, /\.rsvp-focus-line\s*\{[\s\S]*?linear-gradient\(/);
assert.match(page, /\.hero-focus-line\s*\{[^}]*linear-gradient\(/);
assert.match(page, /\.flow-focus-line\s*\{[^}]*linear-gradient\(/);
assert.match(page, /grid-template-columns:\s*calc\(50% - 0\.85ch\) 1\.7ch/);
assert.doesNotMatch(`${page}\n${globalCss}`, /box-shadow:\s*0 0 0 0\.08em/);
console.log('reader UI contracts passed');
