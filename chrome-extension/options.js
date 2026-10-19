/* global chrome, BriskReadExt, SR_KEYS, srGetSettings, srSaveSettings */
const X = BriskReadExt;
const $ = (id) => document.getElementById(id);

function flash(el, message, kind = 'ok') {
  el.textContent = message;
  el.className = `status ${kind}`;
}

async function save(patch) {
  await srSaveSettings(patch);
  flash($('reader-status'), 'Saved.');
}

function fillVoices(current) {
  const voices = [...speechSynthesis.getVoices()].sort((a, b) => X.voiceScore(b) - X.voiceScore(a));
  const sel = $('voice');
  sel.innerHTML = '<option value="">Best available</option>';
  for (const v of voices) sel.add(new Option(`${v.name} · ${v.lang}`, v.name));
  sel.value = voices.some((v) => v.name === current) ? current : '';
  sel.disabled = !voices.length;
}

async function loadReader() {
  const s = await srGetSettings();
  $('wpm').value = s.wpm;
  $('wpm-out').textContent = s.wpm;
  for (const id of ['mode', 'theme', 'size']) $(id).value = s[id];
  $('audio').checked = s.audio;
  $('ramp').checked = s.ramp;
  fillVoices(s.voice);
  speechSynthesis.addEventListener('voiceschanged', () => fillVoices($('voice').value || s.voice));

  $('wpm').addEventListener('input', (e) => ($('wpm-out').textContent = e.target.value));
  $('wpm').addEventListener('change', (e) => save({ wpm: Number(e.target.value) }));
  for (const id of ['mode', 'theme', 'size', 'voice']) $(id).addEventListener('change', (e) => save({ [id]: e.target.value }));
  for (const id of ['audio', 'ramp']) $(id).addEventListener('change', (e) => save({ [id]: e.target.checked }));
}

async function loadShortcuts() {
  const ORDER = ['speed-read-tab', 'bionic-tab', 'read-later-tab'];
  const commands = (await chrome.commands.getAll()).filter((c) => ORDER.includes(c.name)).sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
  $('shortcuts').innerHTML = '';
  for (const c of commands) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = c.description;
    const key = document.createElement(c.shortcut ? 'kbd' : 'span');
    key.textContent = c.shortcut || 'Not set';
    if (!c.shortcut) key.className = 'unset';
    li.append(name, key);
    $('shortcuts').append(li);
  }
  for (const kbd of document.querySelectorAll('kbd[data-cmd]')) {
    const shortcut = commands.find((c) => c.name === kbd.dataset.cmd)?.shortcut;
    if (shortcut) kbd.textContent = shortcut;
  }
  $('btn-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
}

// Gemini key lives in storage.local, never storage.sync: a synced key would ride
// Google account sync to every machine the user signs into.
async function loadKey() {
  const { [SR_KEYS.geminiKey]: key } = await chrome.storage.local.get(SR_KEYS.geminiKey);
  $('gemini-key').value = key || '';
  $('btn-save-key').addEventListener('click', async () => {
    const value = $('gemini-key').value.trim();
    if (!/^[\w-]{20,}$/.test(value)) return flash($('key-status'), 'That does not look like a Gemini API key.', 'error');
    await chrome.storage.local.set({ [SR_KEYS.geminiKey]: value });
    flash($('key-status'), 'Key saved. Summarise and Ask are ready in the reader.');
  });
  $('btn-clear-key').addEventListener('click', async () => {
    await chrome.storage.local.remove(SR_KEYS.geminiKey);
    $('gemini-key').value = '';
    flash($('key-status'), 'Key removed.');
  });
}

$('btn-clear-data').addEventListener('click', async () => {
  await chrome.storage.local.remove([SR_KEYS.readLater, SR_KEYS.progress]);
  flash($('data-status'), 'Read-later queue and reading positions cleared.');
});
$('btn-demo').addEventListener('click', () => chrome.tabs.create({ url: 'reader.html?demo=1' }));
$('welcome').hidden = location.hash !== '#welcome';

loadReader();
loadShortcuts();
loadKey();
