/* global chrome, pdfjsLib, BriskReadOverlay, srGetSettings, srGetProgress */
/**
 * Standalone reader tab (reader.html). Mounts the same reader UI as the in-page
 * overlay for: PDFs open in Chrome's viewer, pages Chrome blocks, local PDF or
 * text files, pasted text, and the welcome demo.
 */
globalThis.__BRISK_STANDALONE = true;

const DEMO = {
  title: 'Welcome to BriskRead',
  url: '',
  selection: true, // demo text: do not save a resume position
  text: `Reading faster is mostly about removing friction, not about superhuman tricks.

When your eyes jump across a line, they stop several times per sentence and sometimes slide back to re-read. Flash mode removes those jumps. Each word appears at one fixed point, and the coloured letter tells your eye exactly where to land.

Start slower than you think. Most people read comfortably at 250 to 300 words per minute. Raise the speed in small steps with the up arrow, and drop back the moment you stop understanding.

Press A to listen while you read. Hearing the words and seeing them at the same time helps many readers stay focused for longer.

When a text is dense, switch to Focus mode with the 2 key. You see the full page with a highlight that moves at your pace, so you keep the context and the rhythm.

That is it. Press Escape to close this demo, then try Alt+Shift+S on any article.`,
};

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let cssText = null;

async function overlayCss() {
  cssText ||= (
    await Promise.all(['styles/tokens.css', 'styles/overlay.css'].map((f) => fetch(f).then((r) => r.text())))
  ).join('\n');
  return cssText;
}

function showLanding(message = '') {
  $('loading').hidden = true;
  $('landing').hidden = false;
  $('notice').hidden = !message;
  $('notice').textContent = message;
  document.title = 'BriskRead Reader';
}

function loading(text) {
  $('landing').hidden = true;
  $('loading').hidden = false;
  $('loading-text').textContent = text;
}

async function closeTab() {
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id) chrome.tabs.remove(tab.id);
}

async function mountArticle(article, { fromLanding = false } = {}) {
  const words = String(article.text || '').trim();
  if (!words) return showLanding('No readable text was found.');
  $('loading').hidden = true;
  $('landing').hidden = true;
  document.title = `${article.title || 'Untitled'} · BriskRead`;
  BriskReadOverlay.mount(
    {
      article,
      settings: await srGetSettings(),
      progress: article.selection ? null : await srGetProgress(article.url),
      css: await overlayCss(),
    },
    { standalone: true, onClose: fromLanding ? () => showLanding() : closeTab }
  );
}

/* ---------- PDF ---------- */

function loadPdfJs() {
  if (globalThis.pdfjsLib) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/pdfjs/pdf.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('PDF engine failed to load'));
    document.head.appendChild(s);
  });
}

/** Text of every page. Blank lines become paragraph breaks so Focus mode stays readable. */
async function pdfToText(data) {
  await loadPdfJs();
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  const meta = await pdf.getMetadata().catch(() => null);
  const pages = [];
  let length = 0;
  for (let p = 1; p <= pdf.numPages && length < 400_000; p += 1) {
    const content = await (await pdf.getPage(p)).getTextContent();
    const page = content.items
      .map((item) => (item.str || '') + (item.hasEOL ? '\n' : ''))
      .join('')
      .replace(/-\n(?=\p{Ll})/gu, '') // re-join words hyphenated across lines
      .replace(/[ \t]+/g, ' ')
      .trim();
    pages.push(page);
    length += page.length;
  }
  return { title: meta?.info?.Title || '', text: pages.join('\n\n').slice(0, 400_000) };
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Fetch the PDF from inside its own tab (same origin, same cookies), so no host permission is needed. */
async function bytesFromTab(tabId) {
  const [r] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const res = await fetch(location.href, { credentials: 'include' });
      if (!res.ok) return { error: `The PDF could not be downloaded (${res.status}).` };
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 60 * 1024 * 1024) return { error: 'This PDF is larger than 60 MB.' };
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { b64: btoa(bin), url: location.href };
    },
  });
  const out = r?.result;
  if (!out?.b64) throw new Error(out?.error || 'The PDF could not be read.');
  return { bytes: base64ToBytes(out.b64), url: out.url };
}

const NO_TEXT =
  'This PDF has no text layer (it is probably a scan). briskread.com/pdf-to-speech can read scanned pages with OCR.';

async function readPdfTab(tabId, fallbackTitle) {
  loading('Reading PDF…');
  try {
    const { bytes, url } = await bytesFromTab(tabId);
    const { title, text } = await pdfToText(bytes);
    if (!text.trim()) return showLanding(NO_TEXT);
    const name = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || '');
    await mountArticle({ title: title || name || fallbackTitle || 'PDF', text, url });
  } catch (err) {
    // file:// PDFs land here too: pages cannot fetch file URLs, but the file picker can open them.
    showLanding(`${err.message.replace(/\.?$/, '.')} You can also open the PDF with the button below.`);
  }
}

async function readFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  loading(isPdf ? 'Reading PDF…' : 'Reading file…');
  try {
    const parsed = isPdf ? await pdfToText(new Uint8Array(await file.arrayBuffer())) : { title: '', text: await file.text() };
    if (!parsed.text.trim()) return showLanding(isPdf ? NO_TEXT : 'That file is empty.');
    // Local files have no URL; name + size is a stable enough key to resume later.
    await mountArticle(
      { title: parsed.title || file.name, text: parsed.text, url: `file:${file.name}:${file.size}` },
      { fromLanding: true }
    );
  } catch (err) {
    showLanding(`Could not open that file: ${err.message}`);
  }
}

/* ---------- boot ---------- */

const BLOCKED =
  'Chrome does not let extensions read this page (browser pages, the Chrome Web Store and some settings screens are off-limits). Paste the text below instead.';
const FILE_ACCESS =
  'To read files opened from your computer, turn on “Allow access to file URLs” for BriskRead in chrome://extensions, or open the file below.';

async function start() {
  $('btn-paste').addEventListener('click', () => {
    const text = $('paste').value.trim();
    if (text) mountArticle({ title: 'Pasted text', text, url: '', selection: true }, { fromLanding: true });
  });
  $('file').addEventListener('change', (e) => readFile(e.target.files[0]));
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    readFile(e.dataTransfer.files[0]);
  });

  if (params.has('demo')) return mountArticle(DEMO);

  const key = params.get('k');
  const payload = key ? (await chrome.storage.session.get(key))[key] : null;
  if (key) chrome.storage.session.remove(key);
  if (payload?.article?.text) return mountArticle(payload.article);
  if (payload?.pdfTabId) return readPdfTab(payload.pdfTabId, payload.title);
  if (payload?.error === 'file') return showLanding(FILE_ACCESS);
  if (payload?.error === 'blocked') return showLanding(BLOCKED);
  if (payload?.article) return showLanding('No readable text was found on that page. Select the text you want first, or paste it here.');
  showLanding();
}

document.addEventListener('DOMContentLoaded', start);
