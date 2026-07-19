/* global chrome */
const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(['reader', 'empty', 'document-title', 'left', 'anchor', 'right', 'progress', 'position', 'remaining', 'back', 'play', 'forward', 'mode', 'wpm', 'wpm-value', 'close'].map((id) => [id, $(id)]));

let words = [];
let index = 0;
let wpm = 350;
let playing = true;
let timer;
let chunkSize = 1;

function orpIndex(word) {
  const clean = word.replace(/^[^\p{L}\p{N}]+/u, '');
  const offset = word.length - clean.length;
  const length = clean.length;
  return Math.min(word.length - 1, offset + (length <= 1 ? 0 : length <= 5 ? 1 : length <= 9 ? 2 : length <= 13 ? 3 : 4));
}

function delayFor(word) {
  let delay = 60000 / wpm;
  if (word.length >= 12) delay *= 1.35;
  else if (word.length >= 8) delay *= 1.15;
  if (/[.!?]["')\]]*$/.test(word)) delay *= 1.8;
  else if (/[,;:]["')\]]*$/.test(word)) delay *= 1.3;
  return delay;
}

console.assert(orpIndex('create') === 2 && delayFor('stop.') > 60000 / wpm, 'SpeedRead reader timing self-check failed');

function render() {
  const word = words[index] || '';
  const anchor = orpIndex(word);
  ui.left.textContent = word.slice(0, anchor);
  ui.anchor.textContent = word[anchor] || '';
  const tail = words.slice(index + 1, index + chunkSize).join(' ');
  ui.right.textContent = word.slice(anchor + 1) + (tail ? ` ${tail}` : '');
  ui.progress.value = index;
  ui.position.textContent = `${Math.min(index + 1, words.length)} / ${words.length}`;
  ui.remaining.textContent = `${Math.max(1, Math.ceil((words.length - index) / wpm))} min left`;
}

function pause() {
  playing = false;
  clearTimeout(timer);
  ui.play.textContent = 'Play';
}

function tick() {
  if (!playing || !words.length) return;
  if (index >= words.length) { index = words.length - 1; pause(); return; }
  render();
  const displayedWords = Math.min(chunkSize, words.length - index);
  const timingWord = words[index + displayedWords - 1];
  const delay = delayFor(timingWord) * displayedWords;
  index += displayedWords;
  timer = setTimeout(tick, delay);
}

function play() {
  if (!words.length) return;
  if (index >= words.length - 1) index = 0;
  playing = true;
  ui.play.textContent = 'Pause';
  tick();
}

function skip(amount) {
  index = Math.max(0, Math.min(words.length - 1, index + amount));
  render();
}

ui.play.addEventListener('click', () => playing ? pause() : play());
ui.back.addEventListener('click', () => skip(-10));
ui.forward.addEventListener('click', () => skip(10));
ui.close.addEventListener('click', () => window.close());
ui.progress.addEventListener('input', () => { index = Number(ui.progress.value); render(); });
ui.mode.addEventListener('change', () => {
  chunkSize = Number(ui.mode.value);
  chrome.storage.local.set({ reader_chunk_size: chunkSize });
  render();
});
ui.wpm.addEventListener('input', () => {
  wpm = Number(ui.wpm.value);
  ui['wpm-value'].textContent = wpm;
  chrome.storage.local.set({ reader_wpm: wpm });
});

document.addEventListener('keydown', (event) => {
  if (event.code === 'Space') { event.preventDefault(); playing ? pause() : play(); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); skip(-10); }
  else if (event.key === 'ArrowRight') { event.preventDefault(); skip(10); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); ui.wpm.value = Math.min(1000, wpm + 25); ui.wpm.dispatchEvent(new Event('input')); }
  else if (event.key === 'ArrowDown') { event.preventDefault(); ui.wpm.value = Math.max(100, wpm - 25); ui.wpm.dispatchEvent(new Event('input')); }
  else if (event.key === 'Escape') window.close();
});

chrome.storage.local.get(['sr_reader_article', 'reader_wpm', 'reader_chunk_size'], ({ sr_reader_article: article, reader_wpm, reader_chunk_size }) => {
  words = String(article?.text || '').trim().split(/\s+/).filter(Boolean);
  wpm = Number(reader_wpm) || 350;
  chunkSize = Number(reader_chunk_size) === 3 ? 3 : 1;
  ui.mode.value = chunkSize.toString();
  ui.wpm.value = wpm;
  ui['wpm-value'].textContent = wpm;
  ui['document-title'].textContent = article?.title || 'Reader';
  ui.progress.max = Math.max(0, words.length - 1);
  ui.reader.hidden = !words.length;
  ui.empty.hidden = Boolean(words.length);
  if (words.length) { render(); setTimeout(play, 350); }
});
