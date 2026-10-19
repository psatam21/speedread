import assert from 'node:assert/strict';
import '../public/readability.js';

const R = globalThis.BriskReadReadability;
const close = (actual, expected, msg, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < eps, `${msg}: got ${actual}, expected ${expected}`);

// ---- syllables: tricky words ------------------------------------------------
const SYLLABLES = {
  the: 1, readable: 3, created: 3, every: 2, beautiful: 3, rhythm: 2, queue: 1, table: 2,
  people: 2, business: 2, played: 1, walked: 1, wanted: 2, makes: 1, boxes: 2, tables: 2,
  being: 2, going: 2, radio: 3, video: 3, society: 4, continuous: 4, curious: 3, social: 2,
  capitalism: 5, simple: 2, whale: 1, area: 3, idea: 3, science: 2, something: 2, evaluate: 4,
  government: 3, management: 3, happiness: 3, strength: 1, through: 1, thought: 1, beyond: 2,
  player: 2, yes: 1, young: 1, agreed: 2, value: 2, issue: 2, safely: 2, careful: 2,
  statement: 2, element: 3, movements: 2, achievement: 3, little: 2, once: 1, dying: 2,
  playing: 2, quality: 3, medium: 3, serious: 3, delicious: 3, anxious: 2, official: 3,
  media: 3, trial: 2, million: 2, familiar: 3, nation: 2, education: 4, readability: 5,
  I: 1, a: 1, '2024': 1, 'U.S': 2, 'well-known': 2, 'twenty-three': 3, '': 1,
};
for (const [word, n] of Object.entries(SYLLABLES)) {
  assert.equal(R.countSyllables(word), n, `syllables("${word}")`);
}
assert.ok(Object.keys(SYLLABLES).length >= 15);

// ---- sentence splitting -----------------------------------------------------
const sentencesOf = (t) => R.splitSentences(t).map((s) => t.slice(s.start, s.end));
assert.deepEqual(sentencesOf('Dr. Smith went home. He slept.'), ['Dr. Smith went home.', 'He slept.']);
assert.deepEqual(sentencesOf('Pi is 3.14 and e is 2.72. Both are irrational.'),
  ['Pi is 3.14 and e is 2.72.', 'Both are irrational.']);
assert.deepEqual(sentencesOf('See e.g. the chart. It helps.'), ['See e.g. the chart.', 'It helps.']);
assert.deepEqual(sentencesOf('Mr. and Mrs. Jones visited the U.S. last year. They loved it.'),
  ['Mr. and Mrs. Jones visited the U.S. last year.', 'They loved it.']);
assert.deepEqual(sentencesOf('J. K. Rowling wrote it. She won.'), ['J. K. Rowling wrote it.', 'She won.']);
assert.deepEqual(sentencesOf('Wait... what happened? Nothing!'), ['Wait... what happened?', 'Nothing!']); // ellipsis, lower case follows
assert.deepEqual(sentencesOf('Wait... What happened?'), ['Wait...', 'What happened?']); // ellipsis, capital follows
assert.deepEqual(sentencesOf('He said "Stop!" and left. Then it ended.'), ['He said "Stop!" and left.', 'Then it ended.']);
assert.deepEqual(sentencesOf('She bought apples, etc. The next day she left.'), ['She bought apples, etc.', 'The next day she left.']);
assert.deepEqual(sentencesOf('1. Buy milk. 2. Buy eggs.'), ['1. Buy milk.', '2. Buy eggs.']);
assert.deepEqual(sentencesOf('So did I. Then he left.'), ['So did I.', 'Then he left.']);
assert.deepEqual(sentencesOf('Title line\n\nBody text. More text.'), ['Title line', 'Body text.', 'More text.']); // blank line = boundary
assert.deepEqual(sentencesOf('No final period here'), ['No final period here']);
assert.deepEqual(sentencesOf(''), []);
assert.deepEqual(sentencesOf('...  !!'), []);
// Offsets must index the original text exactly (the highlighter relies on this).
const offsetText = '  Hello there.   General Kenobi!  ';
for (const s of R.splitSentences(offsetText)) assert.ok(/^\S.*\S$/.test(offsetText.slice(s.start, s.end)));

// ---- formulas against hand-computed examples --------------------------------
// Example 1: "The cat sat on the mat. The dog ran far."
//   10 words, 2 sentences, every word 1 syllable -> 10 syllables, 0 complex words.
//   letters: 17 + 12 = 29. words/sentence = 5. syllables/word = 1.
//   Flesch Reading Ease = 206.835 - 1.015*5 - 84.6*1                    = 117.16
//   Flesch-Kincaid      = 0.39*5 + 11.8*1 - 15.59                       = -1.84
//   Gunning Fog         = 0.4*(5 + 100*0/10)                            = 2
//   SMOG                = 1.0430*sqrt(0*30/2) + 3.1291                  = 3.1291
//   Coleman-Liau        = 0.0588*(29/10*100) - 0.296*(2/10*100) - 15.8
//                       = 0.0588*290 - 0.296*20 - 15.8 = 17.052-5.92-15.8 = -4.668
//   ARI                 = 4.71*(29/10) + 0.5*5 - 21.43 = 13.659+2.5-21.43 = -5.271
const a = R.analyze('The cat sat on the mat. The dog ran far.');
assert.deepEqual(
  [a.counts.words, a.counts.sentences, a.counts.syllables, a.counts.complexWords, a.counts.letters],
  [10, 2, 10, 0, 29],
);
close(a.scores.fleschReadingEase, 117.16, 'FRE ex1');
close(a.scores.fleschKincaid, -1.84, 'FK ex1');
close(a.scores.gunningFog, 2, 'Fog ex1');
close(a.scores.smog, 3.1291, 'SMOG ex1');
close(a.scores.colemanLiau, -4.668, 'CLI ex1');
close(a.scores.ari, -5.271, 'ARI ex1');
assert.equal(a.smogReliable, false);

// Example 2: "Readability formulas help writers. Plain words win."
//   words: Readability(5 syl) formulas(3) help(1) writers(2) | Plain(1) words(1) win(1)
//   7 words, 2 sentences, 14 syllables, 2 complex words (readability, formulas), letters 30+13 = 43.
//   words/sentence = 3.5, syllables/word = 2, complex share = 2/7.
//   FRE  = 206.835 - 1.015*3.5 - 84.6*2 = 206.835 - 3.5525 - 169.2          = 34.0825
//   FK   = 0.39*3.5 + 11.8*2 - 15.59 = 1.365 + 23.6 - 15.59                  = 9.375
//   Fog  = 0.4*(3.5 + 100*2/7) = 0.4*32.0714285714                           = 12.8285714286
//   SMOG = 1.0430*sqrt(2*30/2) + 3.1291 = 1.0430*sqrt(30) + 3.1291           = 8.8418...
//   CLI  = 0.0588*(43/7*100) - 0.296*(2/7*100) - 15.8
//        = 0.0588*614.285714 - 0.296*28.571429 - 15.8 = 36.12 - 8.457143 - 15.8 = 11.862857
//   ARI  = 4.71*(43/7) + 0.5*3.5 - 21.43 = 28.932857 + 1.75 - 21.43          = 9.252857
const b = R.analyze('Readability formulas help writers. Plain words win.');
assert.deepEqual(
  [b.counts.words, b.counts.sentences, b.counts.syllables, b.counts.complexWords, b.counts.letters],
  [7, 2, 14, 2, 43],
);
close(b.scores.fleschReadingEase, 34.0825, 'FRE ex2');
close(b.scores.fleschKincaid, 9.375, 'FK ex2');
close(b.scores.gunningFog, 12.8285714286, 'Fog ex2');
close(b.scores.smog, 1.043 * Math.sqrt(30) + 3.1291, 'SMOG ex2');
close(b.scores.smog, 8.8418, 'SMOG ex2 value', 1e-3);
close(b.scores.colemanLiau, 11.862857, 'CLI ex2', 1e-5);
close(b.scores.ari, 9.252857, 'ARI ex2', 1e-5);
// Average grade = mean of FK, Fog, CLI, ARI (SMOG joins only at 30+ sentences).
close(b.scores.averageGrade, (9.375 + 12.8285714286 + 11.862857 + 9.252857) / 4, 'average grade', 1e-5);

// SMOG becomes "reliable" and joins the average at 30 sentences.
const thirty = R.analyze('Readability formulas help writers. '.repeat(30));
assert.equal(thirty.counts.sentences, 30);
assert.equal(thirty.smogReliable, true);
close(thirty.scores.averageGrade,
  (thirty.scores.fleschKincaid + thirty.scores.gunningFog + thirty.scores.colemanLiau + thirty.scores.ari + thirty.scores.smog) / 5,
  'average grade with SMOG');

// ---- times ------------------------------------------------------------------
const t = R.analyze(('word ').repeat(238));
assert.equal(t.counts.words, 238);
close(t.time.readingSeconds, 60, 'reading time at 238 wpm');
close(t.time.speakingSeconds, 238 / 150 * 60, 'speaking time at 150 wpm');

// ---- flags and highlight segments -------------------------------------------
const w = (n) => Array(n).fill('word').join(' ');
const flagged = R.analyze(`${w(19)}. ${w(20)}. ${w(29)}. ${w(30)}.`);
assert.deepEqual(flagged.sentences.map((s) => s.level), ['ok', 'hard', 'hard', 'veryhard']);
assert.equal(flagged.counts.hardSentences, 2);
assert.equal(flagged.counts.veryHardSentences, 1);

const hl = 'Plain words win. Communication requires understanding, beautifully.\n\nUnfinished idea';
const segs = R.highlightSegments(hl);
assert.equal(segs.map((s) => s.text).join(''), hl, 'segments must cover the text exactly');
const complexTexts = segs.filter((s) => s.complex).map((s) => s.text);
assert.deepEqual(complexTexts, ['Communication', 'understanding', 'beautifully', 'Unfinished', 'idea']);
assert.ok(segs.every((s, i) => i === 0 || s.sentence !== segs[i - 1].sentence || s.complex !== segs[i - 1].complex), 'adjacent segments merge');
// Hostile input stays plain text in the segments (the page escapes it before display).
assert.equal(R.highlightSegments('<script>alert(1)</script> & more').map((s) => s.text).join(''), '<script>alert(1)</script> & more');

// ---- bands ------------------------------------------------------------------
assert.equal(R.bandFor(65).label, 'Plain English');
assert.equal(R.bandFor(60).label, 'Plain English');
assert.equal(R.bandFor(59.9).label, 'Fairly difficult');
assert.equal(R.bandFor(117).label, 'Very easy');
assert.equal(R.bandFor(-20).label, 'Very difficult');

// ---- empty / tiny input never throws and never yields NaN -------------------
const finite = (obj, path = '') => {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${path}${k} is ${v}`);
    else if (v && typeof v === 'object' && !Array.isArray(v)) finite(v, `${path}${k}.`);
  }
};
for (const input of ['', '   \n  ', '...', '!!!', 'Hello', 'a', '42', 'Hello.', 'Hello, world', null, undefined]) {
  const r = R.analyze(input);
  finite(r.counts, 'counts.');
  finite(r.averages, 'averages.');
  finite(r.scores, 'scores.');
  finite(r.time, 'time.');
  assert.equal(R.highlightSegments(input).map((s) => s.text).join(''), String(input ?? ''));
}
assert.equal(R.analyze('').empty, true);
assert.equal(R.analyze('').counts.words, 0);
assert.equal(R.analyze('Hello').counts.words, 1);
assert.equal(R.analyze('Hello').counts.sentences, 1);
assert.equal(R.analyze('Hello').counts.syllables, 2);

console.log('readability checks passed');
