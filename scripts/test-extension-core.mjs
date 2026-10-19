// Pure-logic checks for chrome-extension/lib/ext-core.js and the package validator. No browser needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EXT_DIR, stageExtension, validateExtension } from './package-extension.mjs';

await import(pathToFileURL(path.join(EXT_DIR, 'lib', 'ext-core.js')).href);
const X = globalThis.BriskReadExt;

// settings: garbage in, valid settings out
assert.deepEqual(X.normalizeSettings(null), X.DEFAULT_SETTINGS);
const s = X.normalizeSettings({ wpm: 5000, mode: 'nope', theme: 'sepia', size: 'l', audio: 'yes', ramp: false });
assert.equal(s.wpm, X.WPM_MAX);
assert.equal(s.mode, 'rsvp');
assert.equal(s.theme, 'sepia');
assert.equal(s.audio, false);
assert.equal(s.ramp, false);
assert.equal(X.clampWpm(337), 325);

// pacing: punctuation and long words slow down; slow start eases in and then stops
assert.ok(X.delayFor('end.', 300) > X.delayFor('end', 300));
assert.ok(X.delayFor('extraordinarily', 300) > X.delayFor('cat', 300));
assert.ok(X.delayFor('cat', 300, 0) > X.delayFor('cat', 300, 3));
assert.equal(X.delayFor('cat', 300, 4), X.delayFor('cat', 300));

// bionic split matches the site's converter
assert.deepEqual(['a', 'the', 'reading', 'extraordinary'].map(X.bionicHead), [1, 2, 3, 6]);

// speech boundary -> word index
const text = 'One  two\nthree four.';
const starts = X.wordStarts(text);
assert.deepEqual(starts, [0, 5, 9, 15]);
assert.equal(X.wordAt(starts, 0), 0);
assert.equal(X.wordAt(starts, 6), 1);
assert.equal(X.wordAt(starts, 8), 1); // on the newline: stays on the word before
assert.equal(X.wordAt(starts, 99), 3);
assert.equal(X.wordAt([], 3), 0);
assert.equal(X.rateForWpm(150), 1);
assert.equal(X.rateForWpm(9000), 3);

// voices: natural cloud voices beat legacy robotic ones
const natural = { name: 'Microsoft Aria Online (Natural) - English', lang: 'en-US', localService: false };
const robotic = { name: 'Microsoft David - English', lang: 'en-US', localService: true };
const spanish = { name: 'Google español', lang: 'es-ES', localService: false };
assert.ok(X.voiceScore(natural) > X.voiceScore(robotic));
assert.ok(X.voiceScore(spanish, 'es') > X.voiceScore(natural, 'es'));

// pages Chrome blocks, and PDFs
for (const u of ['chrome://settings', 'https://chromewebstore.google.com/detail/x', 'https://chrome.google.com/webstore/x', 'edge://flags', 'view-source:https://a.com', '', undefined]) {
  assert.equal(X.isBlockedUrl(u), true, u);
}
for (const u of ['https://example.com', 'http://127.0.0.1:3000/a', 'file:///C:/a.html']) assert.equal(X.isBlockedUrl(u), false, u);
assert.equal(X.isPdfUrl('https://a.com/paper.PDF?dl=1'), true);
assert.equal(X.isPdfUrl('https://a.com/pdf-guide'), false);

// resume only when the same text returns and the reader is mid-way
assert.equal(X.progressKey('https://a.com/x#section'), 'https://a.com/x');
assert.equal(X.resumeIndex({ i: 500, n: 1000 }, 1000), 500);
assert.equal(X.resumeIndex({ i: 500, n: 1000 }, 1200), 0);
assert.equal(X.resumeIndex({ i: 5, n: 1000 }, 1000), 0);
assert.equal(X.resumeIndex({ i: 990, n: 1000 }, 1000), 0);
assert.equal(X.resumeIndex(null, 10), 0);

// package validator: the real build is clean, a broken one is caught
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'br-pack-'));
const staged = stageExtension(path.join(tmp, 'ext'));
assert.deepEqual((await validateExtension(staged)).problems, []);
assert.equal(fs.existsSync(path.join(staged, 'README.md')), false, 'README must not ship');
fs.rmSync(path.join(staged, 'page-bionic.js'));
const manifest = JSON.parse(fs.readFileSync(path.join(staged, 'manifest.json'), 'utf8'));
manifest.description = 'x'.repeat(140);
fs.writeFileSync(path.join(staged, 'manifest.json'), JSON.stringify(manifest));
const broken = (await validateExtension(staged)).problems.join('\n');
assert.match(broken, /page-bionic\.js/);
assert.match(broken, /description is 140 chars/);
fs.rmSync(tmp, { recursive: true, force: true });

console.log('extension core checks passed');
