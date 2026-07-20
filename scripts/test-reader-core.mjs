import assert from 'node:assert/strict';
import '../public/reader-core.js';

const { getOrpIndex, getPhraseParts, getFlowContext } = globalThis.SpeedReadReaderCore;
assert.equal(getOrpIndex('horizontal'), 3);
assert.deepEqual(getPhraseParts(['keep', 'the', 'meaning'], 1), {
  left: 'keep t',
  orp: 'h',
  right: 'e meaning',
});
assert.equal(getFlowContext('one two three four five six seven eight nine ten'.split(' '), 4).word, 'five');
console.log('reader-core checks passed');
