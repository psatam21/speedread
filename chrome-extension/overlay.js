/* global chrome, BriskReadReaderCore */
/**
 * In-page BriskRead overlay. Injected by background.js together with
 * lib/reader-core.js (isolated world, so nothing leaks to the host page).
 * Everything renders inside a Shadow DOM root: host CSS cannot reach in,
 * ours cannot reach out.
 */
(function () {
  const CORE = globalThis.BriskReadReaderCore;
  const HOST_ID = '__briskread_overlay_host';

  if (window.__briskReadOverlay) {
    window.__briskReadOverlay.open();
    return;
  }

  const PRICING_URL = 'https://briskread.com/#pricing';
  const MODES = [
    { id: 'rsvp', label: 'Flash', hint: 'One word at a fixed focal point', primary: true },
    { id: 'focus', label: 'Focus', hint: 'Full text with a moving highlight', primary: true },
    { id: 'phrase', label: 'Phrase', hint: 'Three words at a time' },
    { id: 'flow', label: 'Flow', hint: 'Focal point with paragraph context' },
    { id: 'bionic', label: 'Bionic', hint: 'Bolded word openings' },
    { id: 'standard', label: 'Page', hint: 'Plain text' },
  ];
  const TEXT_MODES = new Set(['focus', 'bionic', 'standard']);

  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Word-length + punctuation pacing, same shape as reader.js.
  const delayFor = (word, wpm) => {
    let delay = 60000 / wpm;
    if (word.length >= 12) delay *= 1.35;
    else if (word.length >= 8) delay *= 1.15;
    if (/[.!?]["')\]]*$/.test(word)) delay *= 1.8;
    else if (/[,;:]["')\]]*$/.test(word)) delay *= 1.3;
    return delay;
  };

  const bionic = (word) => {
    const head = Math.max(1, Math.round(word.length * 0.45));
    return `<b>${esc(word.slice(0, head))}</b>${esc(word.slice(head))}`;
  };

  console.assert(
    CORE && CORE.getOrpIndex('create') === 2 && delayFor('stop.', 300) > 200 && bionic('ab').startsWith('<b>a'),
    '[BriskRead] overlay self-check failed'
  );

  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.wrap {
  position: fixed; inset: 0; z-index: 2147483647;
  display: flex; flex-direction: column;
  background: #0b0d12; color: #e8ecf4;
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
header { display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-bottom: 1px solid #1e2430; }
.brand { font-weight: 700; letter-spacing: -.01em; color: #7aa2ff; }
.doc-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #97a2b6; font-size: 13px; }
button { font: inherit; color: inherit; background: #161b26; border: 1px solid #262d3c; border-radius: 8px; padding: 7px 12px; cursor: pointer; }
button:hover { background: #1d2432; }
button.on { background: #2c4bd0; border-color: #3a5cf0; color: #fff; }
button.primary { background: #2c4bd0; border-color: #3a5cf0; color: #fff; font-weight: 600; }
button:disabled { opacity: .5; cursor: default; }
.modes { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 18px 0; }
.modes .sep { width: 1px; background: #262d3c; margin: 2px 4px; }
.modes button.big { padding: 9px 18px; font-weight: 600; }
main { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 18px; }
.stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; position: relative; }
.view { display: none; width: 100%; }
.view.on { display: block; }
#view-word { text-align: center; font-size: clamp(28px, 5.2vw, 62px); font-weight: 600; letter-spacing: -.02em; white-space: nowrap; }
#view-word .l { color: #cbd4e6; }
#view-word .o { color: #ff7a59; }
#view-word .r { color: #cbd4e6; }
#view-flow { text-align: center; max-width: 900px; margin: 0 auto; font-size: 20px; }
#view-flow .dim { color: #56607a; display: block; font-size: 16px; }
#view-flow .near { color: #97a2b6; }
#view-flow .cur { color: #ff7a59; font-size: 30px; font-weight: 700; padding: 0 6px; }
#view-text { position: relative; max-height: 100%; overflow-y: auto; max-width: 780px; margin: 0 auto; font-size: 18px; line-height: 1.9; color: #b9c3d6; }
#view-text p { margin: 0 0 18px; }
#view-text span { cursor: pointer; border-radius: 3px; }
#view-text span.cur { background: #ff7a59; color: #12151d; }
.controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 14px; border-top: 1px solid #1e2430; }
.spacer { flex: 1; }
input[type=range] { accent-color: #3a5cf0; }
#seek { flex: 1 1 200px; min-width: 140px; }
.meta { font-size: 12px; color: #7b8699; white-space: nowrap; }
.ai { border-top: 1px solid #1e2430; padding: 14px 18px; max-height: 46vh; display: flex; flex-direction: column; gap: 10px; }
.ai[hidden] { display: none; }
.ai .row { display: flex; gap: 8px; }
#ai-log { overflow-y: auto; display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
.msg { padding: 9px 12px; border-radius: 10px; white-space: pre-wrap; }
.msg.user { background: #2c4bd0; align-self: flex-end; max-width: 80%; }
.msg.bot { background: #161b26; border: 1px solid #262d3c; }
.msg.err { background: #3a1620; border: 1px solid #6d2436; color: #ffb4c0; }
#ai-input { flex: 1; background: #12151d; border: 1px solid #262d3c; border-radius: 8px; padding: 9px 12px; color: inherit; font: inherit; }
.gate { margin: auto; max-width: 460px; text-align: center; display: flex; flex-direction: column; gap: 14px; }
.gate h2 { font-size: 24px; letter-spacing: -.02em; }
.gate p { color: #97a2b6; }
.gate a { display: inline-block; text-decoration: none; background: #2c4bd0; color: #fff; font-weight: 600; padding: 11px 20px; border-radius: 10px; }
`;

  const state = {
    words: [],
    index: 0,
    wpm: 350,
    mode: 'rsvp',
    playing: false,
    timer: null,
    textRenderedFor: null,
    article: null,
    premium: false,
  };

  let host = document.getElementById(HOST_ID);
  let root = null;
  let prevOverflow = '';
  const $ = (sel) => root.querySelector(sel);

  function buildShell() {
    host = document.createElement('div');
    host.id = HOST_ID;
    root = host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);
    root.innerHTML = `<style>${CSS}</style><div class="wrap"></div>`;
  }

  function renderGate() {
    $('.wrap').innerHTML = `
      <header>
        <span class="brand">BriskRead</span>
        <span class="doc-title"></span>
        <button id="close">Esc ✕</button>
      </header>
      <main>
        <div class="gate">
          <h2>In-page reading is Premium</h2>
          <p>Lifetime Premium unlocks the on-page reader, Focus and Flash modes, AI summaries and document chat — on every site, without leaving the tab.</p>
          <p><a href="${PRICING_URL}" target="_blank" rel="noopener">Get Lifetime Premium</a></p>
          <p style="font-size:13px">Already bought it? Open the BriskRead extension popup and paste your license key.</p>
        </div>
      </main>`;
    $('#close').addEventListener('click', close);
  }

  function renderReader() {
    const modeBtns = MODES.map((m, i) => {
      const sep = i === 2 ? '<span class="sep"></span>' : '';
      return `${sep}<button data-mode="${m.id}" title="${esc(m.hint)}" class="${m.primary ? 'big' : ''}">${m.label}</button>`;
    }).join('');

    $('.wrap').innerHTML = `
      <header>
        <span class="brand">BriskRead</span>
        <span class="doc-title">${esc(state.article.title || document.title || '')}</span>
        <button id="toggle-ai">AI</button>
        <button id="close">Esc ✕</button>
      </header>
      <div class="modes">${modeBtns}</div>
      <main>
        <div class="stage">
          <div class="view" id="view-word"><span class="l"></span><span class="o"></span><span class="r"></span></div>
          <div class="view" id="view-flow"></div>
          <div class="view" id="view-text"></div>
        </div>
        <div class="controls">
          <button id="back" title="Back 10 words">◀◀</button>
          <button id="play" class="primary">Play</button>
          <button id="fwd" title="Forward 10 words">▶▶</button>
          <input type="range" id="seek" min="0" max="100" step="0.1" value="0" aria-label="Progress" />
          <span class="meta" id="pos"></span>
          <span class="spacer"></span>
          <span class="meta"><span id="wpm-val">${state.wpm}</span> wpm</span>
          <input type="range" id="wpm" min="100" max="1200" step="25" value="${state.wpm}" aria-label="Words per minute" />
        </div>
      </main>
      <div class="ai" hidden>
        <div class="row">
          <button id="ai-summary">Summarise this article</button>
          <span class="spacer"></span>
        </div>
        <div id="ai-log"></div>
        <div class="row">
          <input id="ai-input" placeholder="Ask a question about this article…" />
          <button id="ai-send">Send</button>
        </div>
      </div>`;

    root.querySelectorAll('.modes button').forEach((b) =>
      b.addEventListener('click', () => setMode(b.dataset.mode))
    );
    $('#close').addEventListener('click', close);
    $('#play').addEventListener('click', () => (state.playing ? pause() : play()));
    $('#back').addEventListener('click', () => skip(-10));
    $('#fwd').addEventListener('click', () => skip(10));
    $('#seek').addEventListener('input', (e) => {
      state.index = CORE.getIndexFromPercent(Number(e.target.value), state.words.length);
      render();
    });
    $('#wpm').addEventListener('input', (e) => {
      state.wpm = Number(e.target.value);
      $('#wpm-val').textContent = state.wpm;
      chrome.storage.local.set({ reader_wpm: state.wpm });
    });
    $('#toggle-ai').addEventListener('click', () => {
      const ai = $('.ai');
      ai.hidden = !ai.hidden;
      $('#toggle-ai').classList.toggle('on', !ai.hidden);
      if (!ai.hidden) $('#ai-input').focus();
    });
    $('#ai-summary').addEventListener('click', runSummary);
    $('#ai-send').addEventListener('click', runChat);
    $('#ai-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runChat();
    });

    setMode(state.mode);
  }

  function setMode(mode) {
    state.mode = mode;
    chrome.storage.local.set({ overlay_mode: mode });
    root.querySelectorAll('.modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    $('#view-word').classList.toggle('on', mode === 'rsvp' || mode === 'phrase');
    $('#view-flow').classList.toggle('on', mode === 'flow');
    $('#view-text').classList.toggle('on', TEXT_MODES.has(mode));
    if (TEXT_MODES.has(mode)) buildTextView(mode);
    render();
  }

  // Rebuilt only when the mode changes markup (bionic vs plain), not per tick.
  function buildTextView(mode) {
    const key = mode === 'bionic' ? 'bionic' : 'plain';
    if (state.textRenderedFor === key) return;
    let i = 0;
    const html = state.article.text
      .split(/\n{2,}/)
      .map((para) => {
        const ws = para.trim().split(/\s+/).filter(Boolean);
        if (!ws.length) return '';
        return `<p>${ws
          .map((w) => `<span data-i="${i++}">${key === 'bionic' ? bionic(w) : esc(w)}</span>`)
          .join(' ')}</p>`;
      })
      .join('');
    const view = $('#view-text');
    view.innerHTML = html;
    state.textRenderedFor = key;
    view.addEventListener('click', (e) => {
      const span = e.target.closest('span[data-i]');
      if (!span) return;
      state.index = CORE.clampReaderIndex(Number(span.dataset.i), state.words.length);
      render();
    });
  }

  function render() {
    const { words, index } = state;
    if (!words.length) return;

    if (state.mode === 'rsvp' || state.mode === 'phrase') {
      const word = words[index] || '';
      if (state.mode === 'phrase') {
        const parts = CORE.getPhraseParts(words, index);
        $('#view-word .l').textContent = parts.left;
        $('#view-word .o').textContent = parts.orp;
        $('#view-word .r').textContent = parts.right;
      } else {
        const orp = CORE.getOrpIndex(word);
        $('#view-word .l').textContent = word.slice(0, orp);
        $('#view-word .o').textContent = word.charAt(orp);
        $('#view-word .r').textContent = word.slice(orp + 1);
      }
    } else if (state.mode === 'flow') {
      const c = CORE.getFlowContext(words, index);
      $('#view-flow').innerHTML =
        `<span class="dim">${esc(c.previous)}</span>` +
        `<span class="near">${esc(c.left)}</span><span class="cur">${esc(c.word)}</span><span class="near">${esc(c.right)}</span>` +
        `<span class="dim">${esc(c.next)}</span>`;
    } else {
      const view = $('#view-text');
      const prev = view.querySelector('span.cur');
      if (prev) prev.classList.remove('cur');
      if (state.mode !== 'standard') {
        const cur = view.querySelector(`span[data-i="${index}"]`);
        if (cur) {
          cur.classList.add('cur');
          const target = cur.offsetTop - view.clientHeight / 2;
          if (Math.abs(view.scrollTop - target) > view.clientHeight / 4) view.scrollTop = target;
        }
      }
    }

    $('#seek').value = words.length > 1 ? (index / (words.length - 1)) * 100 : 0;
    $('#pos').textContent = `${index + 1} / ${words.length} · ${Math.max(1, Math.ceil((words.length - index) / state.wpm))} min left`;
  }

  function tick() {
    if (!state.playing) return;
    if (state.index >= state.words.length - 1) {
      render();
      pause();
      return;
    }
    render();
    const delay = delayFor(state.words[state.index], state.wpm);
    state.index += 1;
    state.timer = setTimeout(tick, delay);
  }

  function play() {
    if (!state.words.length) return;
    state.index = CORE.getPlaybackStart(state.index, state.words.length);
    state.playing = true;
    $('#play').textContent = 'Pause';
    tick();
  }

  function pause() {
    state.playing = false;
    clearTimeout(state.timer);
    const btn = $('#play');
    if (btn) btn.textContent = 'Play';
  }

  function skip(n) {
    state.index = CORE.clampReaderIndex(state.index + n, state.words.length);
    render();
  }

  /* ---- AI (same /api/gemini contract as the web app; proxied through the SW
         so the host page's origin never matters and no CORS is needed) ---- */

  function addMsg(cls, text) {
    const log = $('#ai-log');
    const el = document.createElement('div');
    el.className = `msg ${cls}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  async function askAI(prompt, pending) {
    const placeholder = addMsg('bot', pending);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'SR_AI', prompt });
      if (!res?.ok) throw new Error(res?.error || 'AI request failed');
      placeholder.textContent = res.text;
    } catch (err) {
      placeholder.className = 'msg err';
      placeholder.textContent = err.message || 'AI request failed';
    }
    $('#ai-log').scrollTop = $('#ai-log').scrollHeight;
  }

  function runSummary() {
    $('.ai').hidden = false;
    $('#toggle-ai').classList.add('on');
    askAI(
      `Generate a concise speed-reading summary with bullet points for this text:\n\n${state.article.text.slice(0, 8000)}`,
      'Summarising…'
    );
  }

  function runChat() {
    const input = $('#ai-input');
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    addMsg('user', q);
    askAI(
      `You are an AI speed reading assistant. The user has loaded this document in their reader:\n\n---\n${state.article.text.slice(0, 15000)}\n---\n\nAnswer the user's question accurately based on the document text. Keep your answer clear and concise (under 3-4 sentences).\n\nUser Question: ${q}`,
      'Typing…'
    );
  }

  /* ---- lifecycle ---- */

  function onKey(event) {
    if (!host?.isConnected) return;
    const target = event.composedPath()[0];
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (typing || !state.premium) return;
    const keys = { ' ': 1, ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1 };
    if (!keys[event.key]) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === ' ') (state.playing ? pause : play)();
    else if (event.key === 'ArrowLeft') skip(-10);
    else if (event.key === 'ArrowRight') skip(10);
    else {
      const wpmEl = $('#wpm');
      wpmEl.value = Math.max(100, Math.min(1200, state.wpm + (event.key === 'ArrowUp' ? 25 : -25)));
      wpmEl.dispatchEvent(new Event('input'));
    }
  }

  function close() {
    pause();
    window.removeEventListener('keydown', onKey, true);
    document.documentElement.style.overflow = prevOverflow;
    host?.remove();
  }

  async function open() {
    if (host?.isConnected) return;
    let init;
    try {
      init = await chrome.runtime.sendMessage({ type: 'SR_OVERLAY_INIT' });
    } catch {
      init = null;
    }
    if (!init?.ok) return;

    state.premium = !!init.premium;
    state.article = init.article || { title: '', text: '' };
    state.words = String(state.article.text || '').trim().split(/\s+/).filter(Boolean);
    state.index = 0;
    state.wpm = Number(init.wpm) || 350;
    state.mode = MODES.some((m) => m.id === init.mode) ? init.mode : 'rsvp';
    state.textRenderedFor = null;

    buildShell();
    prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey, true);

    if (!state.premium) {
      renderGate();
      return;
    }
    renderReader();
    if (!state.words.length) {
      $('#view-word .o').textContent = '—';
      $('#pos').textContent = 'No readable text found on this page.';
      return;
    }
    render();
    setTimeout(play, 400);
  }

  window.__briskReadOverlay = { open, close };
  open();
})();
