import assert from 'node:assert/strict';
import '../public/words-to-minutes.js';

const {
  RATES,
  countWords,
  secondsFor,
  formatClock,
  aboutMinutes,
  wordsForMinutes,
  clampInt,
  ttsRateForWpm,
  firstWords,
} = globalThis.BriskReadWordsToMinutes;

// Word counting: runs of whitespace, newlines, tabs and empty input.
assert.equal(countWords('one two three'), 3);
assert.equal(countWords('  one   two \t three  '), 3);
assert.equal(countWords('one\ntwo\r\n\r\nthree'), 3);
assert.equal(countWords(''), 0);
assert.equal(countWords('   \n\t '), 0);
assert.equal(countWords(null), 0);
assert.equal(countWords(undefined), 0);
assert.equal(countWords('well-known e-mail'), 2, 'hyphenated words count once');

// Time: 2000 words at 130 WPM is 923 s, shown as 15:23.
assert.equal(secondsFor(2000, 130), 923);
assert.equal(formatClock(secondsFor(2000, 130)), '15:23');
assert.equal(formatClock(secondsFor(1000, 130)), '7:42');
assert.equal(secondsFor(0, 130), 0);
assert.equal(secondsFor(500, 0), 0, 'zero WPM must not divide by zero');
assert.equal(secondsFor(-5, 130), 0);
assert.equal(formatClock(0), '0:00');
assert.equal(formatClock(59.6), '1:00');
assert.equal(formatClock(3600), '1:00:00');
assert.equal(formatClock(3725), '1:02:05');

// Plain-language wording.
assert.equal(aboutMinutes(0), '0 minutes');
assert.equal(aboutMinutes(20), 'under a minute');
assert.equal(aboutMinutes(60), 'about 1 minute');
assert.equal(aboutMinutes(923), 'about 15 minutes');
assert.equal(aboutMinutes(3600), 'about 1 hour');
assert.equal(aboutMinutes(3725), 'about 1 hour 2 minutes');
assert.equal(aboutMinutes(7260), 'about 2 hours 1 minute');

// Reverse: minutes in, words out.
assert.equal(wordsForMinutes(5, 130), 650);
assert.equal(wordsForMinutes(2.5, 130), 325);
assert.equal(wordsForMinutes(0, 130), 0);
assert.equal(wordsForMinutes(5, 0), 0);
// Forward and reverse agree: the words for N minutes take about N minutes.
assert.equal(secondsFor(wordsForMinutes(5, 130), 130), 300);

// Input clamping.
assert.equal(clampInt('250', 40, 400, 130), 250);
assert.equal(clampInt('', 40, 400, 130), 130, 'empty field falls back');
assert.equal(clampInt('abc', 40, 400, 130), 130);
assert.equal(clampInt('10', 40, 400, 130), 130, 'below the minimum falls back');
assert.equal(clampInt('9999', 40, 400, 130), 400, 'above the maximum is capped');
assert.equal(clampInt('130.6', 40, 400, 130), 131);

// Speech preview mapping stays inside the range browsers handle.
assert.equal(ttsRateForWpm(170), 1);
assert.equal(ttsRateForWpm(130), 0.76);
assert.equal(ttsRateForWpm(20), 0.5);
assert.equal(ttsRateForWpm(900), 2);

// First-n-words excerpt keeps the original text and spacing.
assert.equal(firstWords('one two  three four', 3), 'one two  three');
assert.equal(firstWords('short', 100), 'short');
assert.equal(firstWords('  ', 5), '');

// The published rates are in place and the speaking ones are labelled as assumptions.
const byId = Object.fromEntries(RATES.map((r) => [r.id, r]));
assert.equal(byId['read-aloud'].wpm, 183);
assert.equal(byId['silent-nonfiction'].wpm, 238);
assert.equal(byId['silent-fiction'].wpm, 260);
assert.equal(byId['speak-avg'].wpm, 130);
for (const id of ['speak-slow', 'speak-avg', 'speak-fast']) assert.equal(byId[id].source, 'assumption');
for (const id of ['read-aloud', 'silent-nonfiction', 'silent-fiction']) assert.equal(byId[id].source, 'study');

console.log('words-to-minutes checks passed');
