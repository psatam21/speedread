/* global chrome, BriskReadReaderCore, BriskReadExt */
/**
 * BriskRead reader. Two ways in:
 *  - injected into a page by background.js (isolated world): boot() asks the
 *    worker for the article and renders over the page in the top layer;
 *  - loaded by reader.html (PDFs, blocked pages, local files, the welcome demo):
 *    the page calls BriskReadOverlay.mount(init, { standalone: true }).
 * Everything renders in a shadow root, so host CSS cannot reach in and ours cannot leak out.
 */
(function () {
  if (globalThis.BriskReadOverlay) {
    if (!globalThis.__BRISK_STANDALONE) globalThis.BriskReadOverlay.boot();
    return;
  }

  const CORE = globalThis.BriskReadReaderCore;
  const X = globalThis.BriskReadExt;
  const TAG = 'briskread-overlay';
  const MODES = [
    { id: 'rsvp', label: 'Flash', hint: 'One word at a fixed focal point' },
    { id: 'focus', label: 'Focus', hint: 'Full text with a moving highlight' },
    { id: 'phrase', label: 'Phrase', hint: 'Three words at a time' },
    { id: 'flow', label: 'Flow', hint: 'Focal word with its sentence around it' },
    { id: 'bionic', label: 'Bionic', hint: 'Bold word openings guide the eye' },
    { id: 'standard', label: 'Page', hint: 'Clean text, no motion' },
  ];
  const TEXT_MODES = new Set(['focus', 'bionic', 'standard']);
  const WORD_MODES = new Set(['rsvp', 'phrase']);

  const ICON = {
    // Same vector as briskread.com's favicon.svg: ink tile, highlighter bolt and book.
    mark: '<svg class="fill" viewBox="0 0 128 128" aria-hidden="true"><rect width="128" height="128" rx="28" fill="#1e1b16"/><g fill="#ffee9e"><path d="M71 18 48 62h14l-10 46 34-54H70z"/><path d="M38 40l14-4v54l-14-6z" opacity=".92"/><path d="M90 40l-14-4v54l14-6z" opacity=".92"/></g></svg>',
    play: '<svg class="fill" viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
    pause: '<svg class="fill" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M11 7 6 12l5 5M18 7l-5 5 5 5"/></svg>',
    fwd: '<svg viewBox="0 0 24 24"><path d="m13 7 5 5-5 5M6 7l5 5-5 5"/></svg>',
    audio: '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    ai: '<svg viewBox="0 0 24 24"><path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.9L12 18.5l-1.8-5.8L4.5 10.8 10.2 9z"/><path d="M19 3v3M17.5 4.5h3"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };

  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const bionic = (w) => {
    const h = X.bionicHead(w);
    return `<b>${esc(w.slice(0, h))}</b>${esc(w.slice(h))}`;
  };

  console.assert(CORE && X && CORE.getOrpIndex('create') === 2 && bionic('ab').startsWith('<b>a'), '[BriskRead] reader self-check failed');

  let host = null;
  let root = null;
  let state = null;
  let opts = {};
  const sp = { run: 0, timer: null, est: null, active: false, forceLocal: false, stalls: 0, voices: [], broken: false, listening: false };
  const $ = (sel) => root.querySelector(sel);

  /* ---------- lifecycle ---------- */

  async function boot() {
    let init = null;
    try {
      init = await chrome.runtime.sendMessage({ type: 'SR_OVERLAY_INIT' });
    } catch (_) {
      /* worker unreachable: nothing to show */
    }
    if (init?.ok) mount(init, { standalone: false });
  }

  function mount(init, options = {}) {
    // Re-opening over an open reader must keep the page's original overflow, not our 'hidden'.
    const prevOverflow = state ? state.prevOverflow : document.documentElement.style.overflow;
    const prevFocus = state ? state.prevFocus : document.activeElement;
    if (host?.isConnected) close({ keepScroll: true });
    opts = options;
    const article = init.article || { title: '', text: '', url: '' };
    const text = String(article.text || '');
    state = {
      article,
      text,
      words: text.match(/\S+/g) || [],
      starts: X.wordStarts(text),
      index: 0,
      playing: false,
      timer: null,
      sincePlay: 0,
      settings: X.normalizeSettings(init.settings),
      textKey: null,
      saveTimer: null,
      prevFocus,
      prevOverflow,
    };

    host = document.createElement(TAG);
    for (const [k, v] of Object.entries({
      all: 'initial', position: 'fixed', inset: '0', width: '100vw', height: '100vh', 'max-width': 'none',
      'max-height': 'none', margin: '0', padding: '0', border: '0', background: 'transparent',
      'z-index': '2147483647', overflow: 'hidden', display: 'block',
    })) host.style.setProperty(k, v, 'important');
    root = host.attachShadow({ mode: 'open' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(init.css || '');
    root.adoptedStyleSheets = [sheet];
    (document.body || document.documentElement).appendChild(host);
    // Top layer: above every page z-index, transform and modal the page already opened.
    host.popover = 'manual';
    try {
      host.showPopover();
    } catch (_) {
      /* popover unsupported: the max z-index above still applies */
    }

    render();
    if (!opts.standalone) document.documentElement.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey, true);
    for (const t of ['keydown', 'keyup', 'keypress']) host.addEventListener(t, (e) => e.stopPropagation());
    $('.wrap').focus({ preventScroll: true });
    loadVoices();

    if (!state.words.length) return;
    const resumeAt = X.resumeIndex(init.progress, state.words.length);
    if (resumeAt) {
      state.index = resumeAt;
      toast(`Resumed at ${Math.round((resumeAt / state.words.length) * 100)}%`, 'Start over', () => seek(0));
    }
    draw();
    if (init.autoplay !== false) setTimeout(() => state && !state.playing && play(), 450);
  }

  function close({ keepScroll = false } = {}) {
    if (!state) return;
    pause();
    window.removeEventListener('keydown', onKey, true);
    if (!keepScroll && !opts.standalone) document.documentElement.style.overflow = state.prevOverflow;
    host?.remove();
    host = null;
    try {
      state.prevFocus?.focus?.({ preventScroll: true });
    } catch (_) {
      /* element gone */
    }
    state = null;
    if (opts.standalone && !keepScroll) opts.onClose?.();
  }

  /* ---------- markup ---------- */

  function render() {
    const s = state.settings;
    const a = state.article;
    const minutes = X.minutesFor(state.words.length, s.wpm);
    const modes = MODES.map(
      (m, i) =>
        `<button role="tab" data-mode="${m.id}" title="${esc(m.hint)} (${i + 1})" aria-selected="false">${m.label}</button>`
    ).join('');
    const chip = (group, value, label) =>
      `<button data-set="${group}" data-value="${value}" aria-pressed="${s[group] === value}">${label}</button>`;

    root.innerHTML = `
      <div class="wrap${state.words.length ? '' : ' is-empty'}" role="dialog" aria-modal="true" aria-label="BriskRead reader" tabindex="-1"
           data-theme="${s.theme}" data-size="${s.size}" data-mode="${s.mode}">
        <header class="top">
          <div class="brand"><span class="mark">${ICON.mark}</span><span>BriskRead</span></div>
          <div class="doc">
            <div class="doc-title">${esc(a.title || 'Untitled')}</div>
            <div class="doc-meta">${state.words.length ? `${state.words.length.toLocaleString()} words · ${minutes} min at ${s.wpm} wpm` : 'No readable text found'}</div>
          </div>
          <div class="actions">
            <button class="ib" data-act="audio" aria-pressed="${s.audio}" title="Read aloud (A)">${ICON.audio}<span class="lbl">Listen</span></button>
            <button class="ib" data-act="ai" aria-expanded="false" title="AI summary and questions">${ICON.ai}<span class="lbl">AI</span></button>
            <button class="ib" data-act="settings" aria-expanded="false" title="Reader settings">${ICON.settings}</button>
            <button class="ib" data-act="close" title="Close (Esc)" aria-label="Close reader">${ICON.close}</button>
          </div>
        </header>
        <nav class="modes"><div class="seg" role="tablist" aria-label="Reading mode">${modes}</div></nav>
        <main class="stage">
          <div class="view v-word" aria-live="off"><div class="word"><span class="l"></span><span class="o"></span><span class="r"></span></div></div>
          <div class="view v-flow"></div>
          <div class="view v-text"></div>
          <div class="empty" ${state.words.length ? 'hidden' : ''}>
            <strong>No readable text here</strong>
            <span>Select the part you want to read, then press Alt+Shift+S or right-click and choose “Speed read selection”.</span>
          </div>
          <div class="toast" role="status" hidden></div>
        </main>
        <footer class="bar">
          <div class="transport">
            <button class="ib" data-act="back" title="Back 10 words (←)" aria-label="Back 10 words">${ICON.back}</button>
            <button class="play" data-act="play" title="Play (Space)" aria-label="Play">${ICON.play}</button>
            <button class="ib" data-act="fwd" title="Forward 10 words (→)" aria-label="Forward 10 words">${ICON.fwd}</button>
          </div>
          <div class="progress">
            <input class="seek" type="range" min="0" max="1000" value="0" aria-label="Reading progress" />
            <div class="pmeta"><span class="pos"></span><span class="left"></span></div>
          </div>
          <div class="speed" aria-label="Reading speed">
            <button data-act="slower" title="Slower (↓)" aria-label="Slower">−</button>
            <output class="wpm">${s.wpm}</output><span>wpm</span>
            <button data-act="faster" title="Faster (↑)" aria-label="Faster">+</button>
          </div>
        </footer>
        <div class="hints"><kbd>Space</kbd> play · <kbd>←</kbd><kbd>→</kbd> skip · <kbd>↑</kbd><kbd>↓</kbd> speed · <kbd>A</kbd> listen · <kbd>1</kbd>–<kbd>6</kbd> modes · <kbd>Esc</kbd> close</div>
        <aside class="panel settings" hidden aria-label="Reader settings">
          <div class="field"><h3>Theme</h3><div class="chips">${chip('theme', 'dark', 'Dark')}${chip('theme', 'light', 'Light')}${chip('theme', 'sepia', 'Sepia')}</div></div>
          <div class="field"><h3>Text size</h3><div class="chips">${chip('size', 's', 'Small')}${chip('size', 'm', 'Medium')}${chip('size', 'l', 'Large')}</div></div>
          <div class="field"><h3>Voice</h3><select class="voice" aria-label="Voice"></select><span class="muted voice-note"></span></div>
          <label class="check"><input type="checkbox" class="ramp" ${s.ramp ? 'checked' : ''} /> Slow start (ease into each run)</label>
        </aside>
        <aside class="panel ai" hidden aria-label="AI assistant">
          <div class="ai-row"><button class="btn primary" data-act="summary">Summarise</button><span class="muted">Uses your own Gemini key. Text goes to Google only when you ask.</span></div>
          <div class="ai-log" aria-live="polite"></div>
          <form class="ai-row ai-form"><input type="text" class="ai-input" placeholder="Ask about this text…" aria-label="Ask about this text" /><button class="btn" type="submit">Ask</button></form>
        </aside>
      </div>`;

    $('.wrap').addEventListener('click', onClick);
    $('.seek').addEventListener('input', (e) => seek(CORE.getIndexFromPercent(Number(e.target.value) / 10, state.words.length)));
    $('.v-text').addEventListener('click', (e) => {
      const span = e.target.closest('span[data-i]');
      if (span) seek(Number(span.dataset.i));
    });
    $('.voice').addEventListener('change', (e) => {
      sp.forceLocal = false;
      saveSettings({ voice: e.target.value });
      if (state.playing && sp.active) restartSoon();
    });
    $('.ramp').addEventListener('change', (e) => saveSettings({ ramp: e.target.checked }));
    $('.ai-form').addEventListener('submit', (e) => {
      e.preventDefault();
      askQuestion();
    });
    setMode(state.settings.mode);
  }

  function onClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.mode) return setMode(btn.dataset.mode);
    if (btn.dataset.set) {
      saveSettings({ [btn.dataset.set]: btn.dataset.value });
      applyLook();
      return;
    }
    const act = btn.dataset.act;
    if (act === 'close') close();
    else if (act === 'play') toggle();
    else if (act === 'back') skip(-10);
    else if (act === 'fwd') skip(10);
    else if (act === 'slower') changeWpm(-25);
    else if (act === 'faster') changeWpm(25);
    else if (act === 'audio') toggleAudio();
    else if (act === 'settings') togglePanel('settings');
    else if (act === 'ai') togglePanel('ai');
    else if (act === 'summary') summarise();
    else if (act === 'options') chrome.runtime.sendMessage({ type: 'SR_OPEN_OPTIONS' });
  }

  function togglePanel(name, force) {
    for (const p of ['settings', 'ai']) {
      const open = p === name ? (force ?? $(`.panel.${p}`).hidden) : false;
      $(`.panel.${p}`).hidden = !open;
      $(`[data-act="${p}"]`).setAttribute('aria-expanded', String(open));
      if (open && p === 'ai') $('.ai-input').focus();
    }
  }

  function applyLook() {
    const s = state.settings;
    const wrap = $('.wrap');
    wrap.dataset.theme = s.theme;
    wrap.dataset.size = s.size;
    root.querySelectorAll('[data-set]').forEach((b) => b.setAttribute('aria-pressed', String(s[b.dataset.set] === b.dataset.value)));
  }

  function saveSettings(patch) {
    state.settings = X.normalizeSettings({ ...state.settings, ...patch });
    chrome.storage.local.set({ sr_settings: state.settings });
  }

  function setMode(mode) {
    saveSettings({ mode });
    const wrap = $('.wrap');
    wrap.dataset.mode = mode;
    root.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    const has = state.words.length > 0;
    $('.v-word').classList.toggle('on', has && WORD_MODES.has(mode));
    $('.v-flow').classList.toggle('on', has && mode === 'flow');
    $('.v-text').classList.toggle('on', has && TEXT_MODES.has(mode));
    if (has && TEXT_MODES.has(mode)) buildText(mode === 'bionic' ? 'bionic' : 'plain');
    draw();
  }

  // Rebuilt only when the markup changes (bionic vs plain), never per word.
  function buildText(key) {
    if (state.textKey === key) return;
    let i = 0;
    $('.v-text').innerHTML = state.text
      .split(/\n{2,}/)
      .map((para) => {
        const ws = para.match(/\S+/g);
        if (!ws) return '';
        return `<p>${ws.map((w) => `<span data-i="${i++}">${key === 'bionic' ? bionic(w) : esc(w)}</span>`).join(' ')}</p>`;
      })
      .join('');
    state.textKey = key;
  }

  /* ---------- drawing ---------- */

  function draw() {
    const { words, index } = state;
    if (!words.length) return;
    const mode = state.settings.mode;

    if (WORD_MODES.has(mode)) {
      let parts;
      if (mode === 'phrase') parts = CORE.getPhraseParts(words, index);
      else {
        const w = words[index] || '';
        const o = CORE.getOrpIndex(w);
        parts = { left: w.slice(0, o), orp: w.charAt(o), right: w.slice(o + 1) };
      }
      $('.word .l').textContent = parts.left;
      $('.word .o').textContent = parts.orp;
      $('.word .r').textContent = parts.right;
    } else if (mode === 'flow') {
      const c = CORE.getFlowContext(words, index);
      $('.v-flow').innerHTML =
        `<span class="dim">${esc(c.previous)}</span><span class="near">${esc(c.left)}</span>` +
        `<span class="cur">${esc(c.word)}</span><span class="near">${esc(c.right)}</span><span class="dim">${esc(c.next)}</span>`;
    } else {
      const view = $('.v-text');
      view.querySelector('span.cur')?.classList.remove('cur');
      if (mode !== 'standard' || state.playing) {
        const cur = view.querySelector(`span[data-i="${index}"]`);
        if (cur) {
          cur.classList.add('cur');
          const target = cur.offsetTop - view.clientHeight / 3;
          if (Math.abs(view.scrollTop - target) > view.clientHeight / 4) view.scrollTo({ top: target, behavior: 'smooth' });
        }
      }
    }

    const n = words.length;
    $('.seek').value = n > 1 ? Math.round((index / (n - 1)) * 1000) : 0;
    $('.pos').textContent = `${Math.round(n > 1 ? (index / (n - 1)) * 100 : 100)}% · ${(index + 1).toLocaleString()} / ${n.toLocaleString()}`;
    $('.left').textContent = `${X.minutesFor(n - index, state.settings.wpm)} min left`;
  }

  function setPlayButton() {
    const btn = $('.play');
    btn.innerHTML = state.playing ? ICON.pause : ICON.play;
    btn.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    btn.title = state.playing ? 'Pause (Space)' : 'Play (Space)';
  }

  let toastTimer = null;
  function toast(message, actionLabel, action) {
    const el = $('.toast');
    el.innerHTML = `<span>${esc(message)}</span>${actionLabel ? `<button>${esc(actionLabel)}</button>` : ''}`;
    if (action) el.querySelector('button').addEventListener('click', () => {
      el.hidden = true;
      action();
    });
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (el.isConnected) el.hidden = true;
    }, 5000);
  }

  /* ---------- playback ---------- */

  function toggle() {
    if (state.playing) pause();
    else play();
  }

  function play() {
    if (!state.words.length) return;
    state.index = CORE.getPlaybackStart(state.index, state.words.length);
    state.playing = true;
    state.sincePlay = 0;
    setPlayButton();
    clearInterval(state.saveTimer);
    state.saveTimer = setInterval(saveProgress, 15000);
    if (state.settings.audio && sp.voices.length && !sp.broken) startSpeech();
    else tick();
  }

  function pause() {
    if (!state) return;
    state.playing = false;
    clearTimeout(state.timer);
    clearInterval(state.saveTimer);
    stopSpeech();
    if ($('.play')) setPlayButton();
    if (state.words.length) draw();
    saveProgress();
  }

  function finish() {
    pause();
    state.index = state.words.length - 1;
    draw();
    toast('Finished. Nice reading.', 'Read again', () => {
      seek(0);
      play();
    });
  }

  function tick() {
    if (!state?.playing || sp.active) return;
    draw();
    if (state.index >= state.words.length - 1) return finish();
    const word = state.words[state.index];
    const delay = X.delayFor(word, state.settings.wpm, state.settings.ramp ? state.sincePlay : 99);
    state.sincePlay += 1;
    state.index += 1;
    state.timer = setTimeout(tick, delay);
  }

  function seek(i) {
    state.index = CORE.clampReaderIndex(i, state.words.length);
    state.sincePlay = 0;
    draw();
    if (state.playing && sp.active) restartSoon();
  }

  function skip(n) {
    seek(state.index + n);
  }

  function changeWpm(delta) {
    saveSettings({ wpm: state.settings.wpm + delta });
    $('.wpm').textContent = state.settings.wpm;
    $('.doc-meta').textContent = `${state.words.length.toLocaleString()} words · ${X.minutesFor(state.words.length, state.settings.wpm)} min at ${state.settings.wpm} wpm`;
    draw();
    if (state.playing && sp.active) restartSoon();
  }

  function saveProgress() {
    const a = state?.article;
    if (!a?.url || a.selection || !state.words.length) return;
    chrome.runtime.sendMessage({ type: 'SR_SAVE_PROGRESS', url: a.url, i: state.index, n: state.words.length }).catch(() => {});
  }

  /* ---------- audio sync (Web Speech API) ---------- */

  const synth = () => window.speechSynthesis;

  function loadVoices() {
    const list = () => {
      const lang = (state?.article.lang || navigator.language || 'en').slice(0, 2);
      sp.voices = [...(synth()?.getVoices() || [])].sort((a, b) => X.voiceScore(b, lang) - X.voiceScore(a, lang));
      if (!root || !state) return;
      const sel = $('.voice');
      sel.innerHTML =
        `<option value="">Best available${sp.voices[0] ? ` (${esc(sp.voices[0].name)})` : ''}</option>` +
        sp.voices.map((v) => `<option value="${esc(v.name)}">${esc(v.name)} · ${esc(v.lang)}</option>`).join('');
      sel.value = sp.voices.some((v) => v.name === state.settings.voice) ? state.settings.voice : '';
      sel.disabled = !sp.voices.length;
      $('.voice-note').textContent = sp.voices.length ? '' : 'This browser has no speech voices installed.';
    };
    list();
    if (!sp.listening) synth()?.addEventListener('voiceschanged', () => loadVoices.list?.());
    sp.listening = true;
    loadVoices.list = list;
  }

  function pickVoice() {
    if (sp.forceLocal) return sp.voices.find((v) => v.localService) || sp.voices[0] || null;
    return sp.voices.find((v) => v.name === state.settings.voice) || sp.voices[0] || null;
  }

  function toggleAudio() {
    const on = !state.settings.audio;
    if (on && !sp.voices.length) {
      toast('No speech voices are available in this browser.');
      return;
    }
    saveSettings({ audio: on });
    $('[data-act="audio"]').setAttribute('aria-pressed', String(on));
    sp.forceLocal = false;
    sp.stalls = 0;
    sp.broken = false;
    if (state.playing) {
      pause();
      play();
    }
  }

  let restartTimer = null;
  function restartSoon() {
    clearTimeout(restartTimer);
    stopSpeech(true);
    restartTimer = setTimeout(() => state?.playing && startSpeech(), 300);
  }

  function stopSpeech(keepActive = false) {
    sp.run += 1;
    clearTimeout(sp.timer);
    clearTimeout(sp.est);
    if (!keepActive) sp.active = false;
    const s = synth();
    if (s && (s.speaking || s.pending)) s.cancel();
  }

  function startSpeech() {
    const s = synth();
    const busy = s.speaking || s.pending;
    stopSpeech(true);
    sp.active = true;
    const run = sp.run;
    // cancel() settles asynchronously in Chrome; speaking right away can be dropped.
    setTimeout(() => {
      if (run !== sp.run || !state?.playing) return;
      const from = state.starts[state.index] || 0;
      sp.chunks = CORE.chunkForTTS(state.text.slice(from), from);
      sp.ci = 0;
      speakChunk(run, false);
    }, busy ? 150 : 0);
  }

  function audioFailed(message) {
    stopSpeech();
    sp.broken = true; // stay silent for this reader session; pressing Listen again retries
    $('[data-act="audio"]').setAttribute('aria-pressed', 'false');
    toast(message);
    if (state.playing) tick(); // keep reading on the visual clock so the user never loses their place
  }

  function speakChunk(run, retry) {
    if (run !== sp.run || !state?.playing) return;
    const chunk = sp.chunks[sp.ci];
    if (!chunk) {
      sp.active = false;
      return finish();
    }
    const s = synth();
    const u = new SpeechSynthesisUtterance(chunk.text);
    sp.utterance = u; // keep a reference: Chrome can garbage-collect a playing utterance
    u.rate = X.rateForWpm(state.settings.wpm);
    const voice = pickVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    const first = X.wordAt(state.starts, chunk.offset);
    const last = X.wordAt(state.starts, chunk.offset + chunk.text.length - 1);
    const msPerWord = 60000 / (150 * u.rate);
    let boundaries = false;

    // Some voices (often cloud ones) never send word boundaries: estimate instead.
    const estimate = () => {
      if (run !== sp.run || boundaries) return;
      if (state.index < last) {
        state.index += 1;
        draw();
      }
      sp.est = setTimeout(estimate, msPerWord);
    };
    const settle = () => {
      clearTimeout(sp.timer);
      clearTimeout(sp.est);
    };

    u.onstart = () => {
      if (run !== sp.run) return;
      state.index = first;
      draw();
      sp.est = setTimeout(estimate, msPerWord);
    };
    u.onboundary = (e) => {
      if (run !== sp.run || e.name !== 'word') return;
      boundaries = true;
      clearTimeout(sp.est);
      state.index = X.wordAt(state.starts, chunk.offset + e.charIndex);
      draw();
    };
    u.onend = () => {
      if (run !== sp.run) return;
      settle();
      sp.stalls = 0;
      sp.ci += 1;
      state.index = Math.min(last + 1, state.words.length - 1);
      speakChunk(run, false);
    };
    u.onerror = (e) => {
      if (run !== sp.run) return;
      settle();
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      if (e.error === 'not-allowed') {
        // Chrome needs a click inside the page before it will speak.
        pause();
        toast('Press Play to start audio.');
        return;
      }
      if (!retry) {
        sp.forceLocal = true;
        setTimeout(() => speakChunk(run, true), 250);
        return;
      }
      sp.ci += 1; // this chunk will not play; skip it rather than stop reading
      speakChunk(run, false);
    };

    // Watchdog: a dropped utterance fires no events at all, which would freeze the reader.
    const limit = Math.max(5000, (last - first + 1) * msPerWord * 2.5);
    sp.timer = setTimeout(() => {
      if (run !== sp.run) return;
      s.cancel();
      sp.stalls += 1;
      if (sp.stalls <= 1) {
        sp.forceLocal = true;
        sp.run += 1;
        const next = sp.run;
        setTimeout(() => speakChunk(next, true), 250);
      } else {
        audioFailed('Audio stopped responding, so BriskRead kept reading silently.');
      }
    }, limit);

    if (s.paused) s.resume();
    s.speak(u);
  }

  /* ---------- AI ---------- */

  function addMsg(cls, text) {
    const el = document.createElement('div');
    el.className = `msg ${cls}`;
    el.textContent = text;
    $('.ai-log').appendChild(el);
    el.scrollIntoView({ block: 'end' });
    return el;
  }

  async function askAI(prompt, pending) {
    const el = addMsg('bot', pending);
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: 'SR_AI', prompt });
    } catch (err) {
      res = { ok: false, error: err.message };
    }
    if (!state) return;
    if (res?.ok) {
      el.textContent = res.text;
      return;
    }
    el.className = 'msg err';
    el.textContent = res?.error || 'AI request failed.';
    if (res?.needsKey) {
      const b = document.createElement('button');
      b.dataset.act = 'options';
      b.textContent = 'Open options to add a key';
      el.appendChild(b);
    }
  }

  function summarise() {
    togglePanel('ai', true);
    askAI(
      `Summarise this text for a speed reader as 4-6 short bullet points, then one line on why it matters.\n\n${state.text.slice(0, 12000)}`,
      'Summarising…'
    );
  }

  function askQuestion() {
    const input = $('.ai-input');
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    addMsg('user', q);
    askAI(
      `Answer the question using only this text. Be concise (under 4 sentences). If the text does not say, reply that it does not.\n\n---\n${state.text.slice(0, 15000)}\n---\n\nQuestion: ${q}`,
      'Thinking…'
    );
  }

  /* ---------- keyboard ---------- */

  function onKey(e) {
    if (!host?.isConnected || !state) return;
    const target = e.composedPath()[0];
    const typing = target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
    let handled = true;

    if (e.key === 'Escape') {
      const open = root.querySelector('.panel:not([hidden])');
      if (open) togglePanel(open.classList.contains('ai') ? 'ai' : 'settings', false);
      else close();
    } else if (e.key === 'Tab') {
      trapFocus(e);
      return;
    } else if (typing || e.ctrlKey || e.metaKey || e.altKey) {
      handled = false;
    } else if (e.key === ' ' || e.key === 'k') toggle();
    else if (e.key === 'ArrowLeft') skip(e.shiftKey ? -50 : -10);
    else if (e.key === 'ArrowRight') skip(e.shiftKey ? 50 : 10);
    else if (e.key === 'ArrowUp') changeWpm(25);
    else if (e.key === 'ArrowDown') changeWpm(-25);
    else if (e.key === 'a' || e.key === 'A') toggleAudio();
    else if (/^[1-6]$/.test(e.key)) setMode(MODES[Number(e.key) - 1].id);
    else handled = false;

    if (handled) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  // The overlay is not a native modal, so keep Tab inside it ourselves.
  function trapFocus(e) {
    const items = [...root.querySelectorAll('button, select, input, [tabindex="0"]')].filter(
      (el) => !el.closest('[hidden]') && !el.disabled
    );
    if (!items.length) return;
    const active = root.activeElement;
    let i = items.indexOf(active);
    i = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
    e.preventDefault();
    e.stopImmediatePropagation();
    items[i].focus();
  }

  globalThis.BriskReadOverlay = { boot, mount, close };
  if (!globalThis.__BRISK_STANDALONE) boot();
})();
