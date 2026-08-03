import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const globalCss = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');

assert.match(globalCss, /\.rsvp-focus-line\s*\{[\s\S]*?linear-gradient\(/);
assert.match(page, /\.hero-focus-line\s*\{[^}]*linear-gradient\(/);
assert.match(page, /\.flow-focus-line\s*\{[^}]*linear-gradient\(/);
// The focal column must be `auto` (sizes to the glyph, so spacing matches the
// rest of the word) between two EQUAL side tracks (so the glyph's centre lands
// on the focal line whatever its width). A calc(50% - Nch) side track only
// centres glyphs that happen to be N*2 wide: narrow "i" drifts left, wide "m"
// drifts right. Both properties are load-bearing; neither alone is correct.
const FOCAL_GRID = /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/;
assert.match(page, FOCAL_GRID, 'flow/hero focal column must be auto between equal tracks');
assert.match(globalCss, FOCAL_GRID, 'RSVP focal column must be auto between equal tracks');
assert.doesNotMatch(`${page}\n${globalCss}`, /box-shadow:\s*0 0 0 0\.08em/);
console.log('reader UI contracts passed');
