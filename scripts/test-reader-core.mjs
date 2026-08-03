import assert from 'node:assert/strict';
import '../public/reader-core.js';

const {
  getOrpIndex,
  getPhraseParts,
  getFlowContext,
  clampReaderIndex,
  getPlaybackStart,
  getIndexFromPercent,
  chunkForTTS,
} = globalThis.BriskReadReaderCore;
assert.equal(getOrpIndex('horizontal'), 3);
assert.deepEqual(getPhraseParts(['keep', 'the', 'meaning'], 1), {
  left: 'keep t',
  orp: 'h',
  right: 'e meaning',
});
assert.equal(getFlowContext('one two three four five six seven eight nine ten'.split(' '), 4).word, 'five');
assert.equal(clampReaderIndex(-10, 10), 0);
assert.equal(clampReaderIndex(15, 10), 9);
assert.equal(getPlaybackStart(5, 10), 5);
assert.equal(getPlaybackStart(9, 10), 0);
assert.equal(getPlaybackStart(10, 10), 0);
assert.equal(getIndexFromPercent(50, 11), 5);
assert.equal(getIndexFromPercent(100, 11), 10);

// chunkForTTS: every chunk must stay under the cap, and its recorded offset must
// point at exactly that chunk in the source — that offset is what keeps the
// highlighted word in sync with the audio.
const longText = ('Rapid Serial Visual Presentation is a reading technique that flashes words. '
  + 'It removes horizontal eye movement! Readers scan faster? Comprehension holds up.\n').repeat(6);
const chunks = chunkForTTS(longText, 0, 180);
assert.ok(chunks.length > 1, 'long text must be split');
for (const c of chunks) {
  assert.ok(c.text.length <= 180, `chunk too long: ${c.text.length}`);
  assert.equal(longText.slice(c.offset, c.offset + c.text.length), c.text, 'offset must locate the chunk');
}
// Nothing but whitespace may be dropped between chunks.
assert.equal(chunks.map(c => c.text).join(' ').replace(/\s+/g, ' ').trim(),
  longText.replace(/\s+/g, ' ').trim(), 'no words lost while chunking');

// baseOffset is carried through so mid-document playback still maps correctly.
assert.equal(chunkForTTS('hello world', 100)[0].offset, 100);
// Short text stays a single chunk; empty text yields none.
assert.equal(chunkForTTS('just a short line', 0, 180).length, 1);
assert.deepEqual(chunkForTTS('   ', 0, 180), []);
// A single unbroken run longer than the cap still terminates.
assert.ok(chunkForTTS('x'.repeat(500), 0, 180).length >= 3);

console.log('reader-core checks passed');
