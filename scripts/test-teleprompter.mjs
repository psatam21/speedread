import assert from 'node:assert/strict';
import '../public/teleprompter.js';

const T = globalThis.BriskReadTeleprompter;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

// Speed: 3000 px, 300 words at 150 WPM = 120 s, so 25 px/s.
near(T.scrollSpeed(3000, 300, 150), 25);
near(T.scrollSpeed(3000, 300, 300), 50, 1e-9); // twice the WPM, twice the speed
near(T.scrollSpeed(6000, 300, 150), 50, 1e-9); // twice the distance, twice the speed

// Zero, negative and junk inputs stand still instead of returning NaN or Infinity.
for (const [d, w, p] of [
  [0, 300, 150], [3000, 0, 150], [3000, 300, 0],
  [-1, 300, 150], [3000, -5, 150], [3000, 300, -10],
  [NaN, 300, 150], [3000, NaN, 150], [3000, 300, NaN],
  [Infinity, 300, 150], [3000, Infinity, 150], [3000, 300, Infinity],
  [undefined, 300, 150], ['3000', 300, 150], [null, null, null],
]) {
  assert.equal(T.scrollSpeed(d, w, p), 0, `scrollSpeed(${d}, ${w}, ${p})`);
}

// Duration estimate and clock format.
assert.equal(T.estimateSeconds(300, 150), 120);
assert.equal(T.estimateSeconds(75, 150), 30);
assert.equal(T.estimateSeconds(0, 150), 0);
assert.equal(T.estimateSeconds(100, 0), 0);
assert.equal(T.estimateSeconds(-3, 150), 0);
assert.equal(T.estimateSeconds(NaN, 150), 0);
assert.equal(T.formatClock(120), '2:00');
assert.equal(T.formatClock(5), '0:05');
assert.equal(T.formatClock(59.6), '1:00');
assert.equal(T.formatClock(3725), '1:02:05');
assert.equal(T.formatClock(-4), '0:00');
assert.equal(T.formatClock(NaN), '0:00');

// Word count.
assert.equal(T.countWords(''), 0);
assert.equal(T.countWords('   \n\t '), 0);
assert.equal(T.countWords(null), 0);
assert.equal(T.countWords('one'), 1);
assert.equal(T.countWords('  one two\n\nthree\tfour  '), 4);

// Clamping.
assert.equal(T.clamp(5, 0, 10), 5);
assert.equal(T.clamp(-5, 0, 10), 0);
assert.equal(T.clamp(50, 0, 10), 10);
assert.equal(T.clamp(NaN, 3, 10), 3);
assert.equal(T.clampSetting('wpm', 5), 40);
assert.equal(T.clampSetting('wpm', 9999), 300);
assert.equal(T.clampSetting('wpm', '180'), 180);
assert.equal(T.clampSetting('wpm', 'fast'), 150); // junk falls back to the default
assert.equal(T.clampSetting('wpm', ''), 150);
assert.equal(T.clampSetting('wpm', null), 150);
assert.equal(T.clampSetting('font', 8), 24);
assert.equal(T.clampSetting('font', 400), 160);
assert.equal(T.clampSetting('width', 10), 40);
assert.equal(T.clampSetting('lh', 5), 2.2);
assert.equal(T.stepWpm(150, 1), 160);
assert.equal(T.stepWpm(150, -1), 140);
assert.equal(T.stepWpm(300, 1), 300);
assert.equal(T.stepWpm(40, -1), 40);

// Advancing: moves by speed * dt, never leaves [0, max], never leaps on a long frame.
near(T.advance(0, 25, 1000 / 60, 3000), 25 / 60);
assert.equal(T.advance(2999.9, 25, 100, 3000), 3000);
assert.equal(T.advance(10, 25, -50, 3000), 10);
assert.equal(T.advance(10, -25, 50, 3000), 10);
assert.equal(T.advance(10, 25, NaN, 3000), 10);
assert.equal(T.advance(10, 25, 50, 0), 0);
near(T.advance(0, 100, 60_000, 3000), 100 * T.MAX_FRAME_MS / 1000); // a minute-long frame counts as MAX_FRAME_MS

// Live speed change: raising WPM mid-run changes the rate only. The position after the
// change is within one frame of travel of the position before it.
{
  const max = 3000, words = 300, dt = 1000 / 60;
  let pos = 0;
  for (let i = 0; i < 300; i += 1) pos = T.advance(pos, T.scrollSpeed(max, words, 150), dt, max);
  const before = pos;
  const after = T.advance(pos, T.scrollSpeed(max, words, 300), dt, max);
  assert.ok(after > before, 'faster WPM keeps moving forward');
  assert.ok(after - before <= 50 * dt / 1000 + 1e-9, 'no jump on speed change');
}

// End to end: scrolling the whole distance at constant WPM takes the estimated time
// (within one frame), so the on-screen "remaining" matches the editor's estimate.
{
  const max = 4321, words = 280, wpm = 140, dt = 1000 / 60;
  const speed = T.scrollSpeed(max, words, wpm);
  let pos = 0, frames = 0;
  while (pos < max && frames < 1e6) { pos = T.advance(pos, speed, dt, max); frames += 1; }
  near((frames * dt) / 1000, T.estimateSeconds(words, wpm), dt / 1000 + 1e-9);
  near(T.remainingSeconds(0, max, speed), T.estimateSeconds(words, wpm), 1e-6);
}

// Progress, remaining time and reflow.
assert.equal(T.progress(0, 100), 0);
assert.equal(T.progress(50, 100), 0.5);
assert.equal(T.progress(500, 100), 1);
assert.equal(T.progress(10, 0), 0);
assert.equal(T.progress(NaN, 100), 0);
assert.equal(T.remainingSeconds(60, 100, 4), 10);
assert.equal(T.remainingSeconds(120, 100, 4), 0);
assert.equal(T.remainingSeconds(10, 100, 0), 0);
assert.equal(T.rescalePosition(500, 1000, 2000), 1000);
assert.equal(T.rescalePosition(0, 0, 2000), 0);
assert.equal(T.rescalePosition(500, 1000, 0), 0);
assert.equal(T.rescalePosition(5000, 1000, 2000), 2000);

// Saved settings: garbage in, safe defaults out.
assert.deepEqual(T.sanitize(null), { script: '', wpm: 150, font: 56, width: 80, lh: 1.5, mirrorH: false, mirrorV: false });
assert.deepEqual(T.sanitize('nope'), T.sanitize(undefined));
assert.deepEqual(
  T.sanitize({ script: 'Hello', wpm: 9999, font: 'big', width: 55, lh: 1.8, mirrorH: true, mirrorV: 'yes' }),
  { script: 'Hello', wpm: 300, font: 56, width: 55, lh: 1.8, mirrorH: true, mirrorV: false },
);
assert.equal(T.sanitize({ script: 'x'.repeat(300000) }).script.length, 200000);
assert.equal(T.sanitize({ script: 42 }).script, '');

console.log('teleprompter tests passed');
