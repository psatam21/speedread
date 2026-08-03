import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const globalCss = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');

assert.match(globalCss, /\.rsvp-focus-line\s*\{[\s\S]*?linear-gradient\(/);
assert.match(page, /\.hero-focus-line\s*\{[^}]*linear-gradient\(/);
assert.match(page, /\.flow-focus-line\s*\{[^}]*linear-gradient\(/);
// The focal column must size to the glyph (max-content), not a fixed width. A
// fixed track pads the highlighted letter so its spacing no longer matches the
// rest of the word, which is visible on every flash.
assert.match(page, /grid-template-columns:\s*calc\(50% - 0\.85ch\) max-content/);
assert.match(globalCss, /grid-template-columns:\s*calc\(50% - 0\.5ch\) max-content/);
assert.doesNotMatch(`${page}\n${globalCss}`, /box-shadow:\s*0 0 0 0\.08em/);
console.log('reader UI contracts passed');
