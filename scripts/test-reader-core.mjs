import assert from 'node:assert/strict';
import '../public/reader-core.js';

const {
  getOrpIndex,
  getPhraseParts,
  getFlowContext,
  clampReaderIndex,
  getPlaybackStart,
  getIndexFromPercent,
} = globalThis.SpeedReadReaderCore;
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
console.log('reader-core checks passed');
