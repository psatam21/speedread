/**
 * Chrome Web Store images, generated from the real extension running on the fixture pages:
 *   release/store/screenshot-1..5.png  1280x800 (store maximum is 5)
 *   release/store/promo-small-440x280.png, promo-marquee-1400x560.png, icon-128.png
 *   npm run ext:assets
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { prepareExtension, launch, startServer, command, makePdf } from './extension-harness.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'release', 'store');
fs.mkdirSync(OUT, { recursive: true });

const { extDir, build } = await prepareExtension();
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}`;
const { ctx, sw, extId } = await launch({
  extDir,
  profileDir: fs.mkdtempSync(path.join(os.tmpdir(), 'briskread-shots-')),
  deviceScaleFactor: 2,
});
const designer = await chromium.launch({ channel: 'chromium' });
const ui = (page) => page.locator('briskread-overlay');
const setSettings = (s) => sw.evaluate((v) => chrome.storage.local.set({ sr_settings: v }), { wpm: 350, mode: 'rsvp', theme: 'dark', size: 'm', audio: false, voice: '', ramp: true, ...s });
const png = (buf) => `data:image/png;base64,${buf.toString('base64')}`;

async function openArticle() {
  const page = await ctx.newPage();
  await page.goto(`${base}/article.html`);
  await page.waitForTimeout(300);
  return page;
}

async function readAndPause(page) {
  await command(sw, page, 'speed-read-tab');
  await ui(page).locator('.play[aria-label="Pause"]').waitFor();
  await page.keyboard.press(' ');
  await ui(page).locator('.play[aria-label="Play"]').waitFor();
}

/** Seek through the shadow DOM's range input until a satisfying word is on screen. */
async function seekTo(page, permille, pick = (w) => w.length >= 8 && /^[a-z]+$/i.test(w)) {
  for (let p = permille; p < 1000; p += 7) {
    const word = await page.evaluate((v) => {
      const root = document.querySelector('briskread-overlay').shadowRoot;
      const seek = root.querySelector('.seek');
      seek.value = v;
      seek.dispatchEvent(new Event('input'));
      const shown = (sel) => root.querySelector(sel)?.offsetParent && root.querySelector(sel).textContent;
      return shown('.word') || shown('.v-flow .cur') || shown('.v-text .cur') || '';
    }, p);
    if (pick(word)) return;
  }
}

// Paper and Pen brand (briskread.com): ink ground, cream paper text, highlighter wash on the key phrase.
const fontFile = (f) => `data:font/woff2;base64,${fs.readFileSync(path.join(build.dir, 'fonts', f)).toString('base64')}`;
const BRAND_CSS = `
  @font-face{font-family:'Hanken Grotesk';font-weight:400;src:url(${fontFile('hanken-grotesk-latin-400-normal.woff2')})}
  @font-face{font-family:'Hanken Grotesk';font-weight:600;src:url(${fontFile('hanken-grotesk-latin-600-normal.woff2')})}
  @font-face{font-family:'Newsreader';font-weight:600;src:url(${fontFile('newsreader-latin-600-normal.woff2')})}
  body{margin:0;overflow:hidden;position:relative;background:#1e1b16;color:#f6f2e9;font-family:'Hanken Grotesk',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  .t{font-family:Newsreader,Georgia,serif;font-weight:600;letter-spacing:-.01em;line-height:1.12}
  mark{background:#ffee9e;color:#1e1b16;padding:0 .12em}`;

/** Marketing frame: caption on top, real screenshot below with a soft shadow. */
async function frame(name, title, sub, shot, { layout = 'below' } = {}) {
  const page = await designer.newPage({ viewport: { width: 1280, height: 800 } });
  const shotHtml =
    layout === 'side'
      ? `<img src="${png(shot)}" style="position:absolute;right:120px;top:60px;width:396px;border-radius:8px;box-shadow:0 30px 80px rgba(0,0,0,.5),0 0 0 1px rgba(246,242,233,.14)">`
      : `<img src="${png(shot)}" style="position:absolute;left:152px;top:176px;width:976px;border-radius:8px;box-shadow:0 30px 80px rgba(0,0,0,.5),0 0 0 1px rgba(246,242,233,.14)">`;
  const cap =
    layout === 'side'
      ? 'position:absolute;left:110px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center;'
      : 'position:absolute;left:0;right:0;top:44px;text-align:center;';
  await page.setContent(`<!doctype html><html><head><style>${BRAND_CSS}</style></head><body style="width:1280px;height:800px">
      <div style="${cap}">
        <div class="t" style="font-size:${layout === 'side' ? 50 : 44}px">${title}</div>
        <div style="font-size:20px;opacity:.82;margin-top:14px;line-height:1.45">${sub}</div>
      </div>${shotHtml}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, name) });
  await page.close();
}

const shotOf = (page) => page.screenshot({ type: 'png' });

// 1. Flash mode, in place, on a real-looking article
await setSettings({});
let page = await openArticle();
await readAndPause(page);
await seekTo(page, 180);
await frame('screenshot-1.png', 'Speed read any page, <mark>right where you are</mark>', 'One shortcut. No copy-paste, no new tab. Flash, Focus, Phrase, Flow, Bionic and Page modes.', await shotOf(page));
await page.close();

// 2. Focus mode + read aloud + settings
await setSettings({ mode: 'focus', theme: 'sepia' });
page = await openArticle();
await readAndPause(page);
await page.keyboard.press('a');
await seekTo(page, 300, (w) => w.length >= 5);
await ui(page).locator('[data-act="settings"]').click();
await frame('screenshot-2.png', 'Listen along as the <mark>highlight</mark> follows the voice', 'Free read-aloud at any speed with your browser’s natural voices. Dark, light and sepia themes.', await shotOf(page));
await page.close();

// 3. Bionic on the live page
page = await openArticle();
await command(sw, page, 'bionic-tab');
await page.waitForTimeout(200);
await frame('screenshot-3.png', 'Bionic reading on <mark>the page itself</mark>', 'Bold word openings guide your eye through any article. Alt+Shift+K to turn it on or off.', await shotOf(page));
await page.close();

// 4. PDFs from Chrome's viewer
await setSettings({ mode: 'flow', theme: 'light' });
const pdfLines = [
  'Annual report: what changed in our reading programme this year.',
  'Students who practised for ten minutes a day finished more books than last year.',
  'Teachers reported that shorter, focused sessions worked better than long ones.',
  'The biggest gains came from letting each reader choose a comfortable pace.',
  'Next year we will add audio support for students who learn better by listening.',
];
const pdfPath = path.join(os.tmpdir(), 'briskread-annual-report.pdf');
fs.writeFileSync(pdfPath, makePdf(pdfLines));
page = await ctx.newPage();
await page.route('**/annual-report.pdf', (r) => r.fulfill({ contentType: 'application/pdf', body: fs.readFileSync(pdfPath) }));
await page.goto(`${base}/annual-report.pdf`).catch(() => {});
await page.waitForTimeout(500);
const readerOpened = ctx.waitForEvent('page', { predicate: (p) => p.url().includes('reader.html') });
await command(sw, page, 'speed-read-tab');
const reader = await readerOpened;
await ui(reader).locator('.play[aria-label="Pause"]').waitFor({ timeout: 20000 });
await reader.keyboard.press(' ');
await seekTo(reader, 380, (w) => w.length >= 7);
await frame('screenshot-4.png', 'PDFs too, straight from <mark>Chrome’s viewer</mark>', 'Open a PDF in Chrome and press Alt+Shift+S. Local PDFs and pasted text work offline.', await shotOf(reader));
await reader.close();
await page.close();

// 5. Popup with the read-later queue
page = await openArticle();
await command(sw, page, 'read-later-tab');
await sw.evaluate(async (articleUrl) => {
  const list = (await chrome.storage.local.get('sr_read_later')).sr_read_later;
  const extra = [
    { title: 'How to Take Notes You Will Actually Reread', words: 1840, url: 'https://example.com/notes' },
    { title: 'A Field Guide to Slow Reading', words: 2610, url: 'https://example.com/slow' },
  ].map((x, i) => ({ id: `demo-${i}`, title: x.title, text: 'word '.repeat(x.words).trim(), url: x.url, wordCount: x.words, savedAt: Date.now() - (i + 1) * 3 * 3600_000 }));
  await chrome.storage.local.set({
    sr_read_later: [...list, ...extra],
    sr_progress: { 'https://example.com/notes': { i: 760, n: 1840, t: Date.now() } },
  });
  return articleUrl;
}, page.url());
const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id, page.url());
const popup = await ctx.newPage();
await popup.setViewportSize({ width: 360, height: 560 });
await popup.emulateMedia({ colorScheme: 'dark' });
await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${tabId}`);
await popup.locator('.q-item').nth(2).waitFor();
await popup.waitForTimeout(200);
const popupShot = await popup.locator('body').screenshot();
await frame('screenshot-5.png', 'Save it for later. <mark>Pick up where you left off.</mark>', 'A read-later queue that remembers your place in every article. No account, nothing leaves your browser.', popupShot, { layout: 'side' });
await popup.close();
await page.close();

/* ---------- promo tiles + icon ---------- */
const mark = png(fs.readFileSync(path.join(build.dir, 'icons', 'icon128.png')));
async function tile(name, w, h, scale) {
  const p = await designer.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<!doctype html><html><head><style>${BRAND_CSS}</style></head><body style="width:${w}px;height:${h}px;display:flex;align-items:center;gap:${24 * scale}px;padding:0 ${40 * scale}px;box-sizing:border-box">
    <img src="${mark}" style="width:${112 * scale}px;height:${112 * scale}px;margin:${-14 * scale}px;flex:none">
    <div>
      <div class="t" style="font-size:${46 * scale}px;line-height:1">BriskRead</div>
      <div style="font-size:${17 * scale}px;opacity:.85;margin-top:${10 * scale}px;line-height:1.35">Read any page faster.<br>Free, private, no account.</div>
      <div class="t" style="margin-top:${14 * scale}px;font-size:${26 * scale}px"><mark>re<span style="color:#a3290f">a</span>d faster</mark></div>
    </div></body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(OUT, name) });
  await p.close();
}
await tile('promo-small-440x280.png', 440, 280, 1);
await tile('promo-marquee-1400x560.png', 1400, 560, 2);
fs.copyFileSync(path.join(build.dir, 'icons', 'icon128.png'), path.join(OUT, 'icon-128.png'));

await designer.close();
await ctx.close();
server.close();
console.log(`Store images written to ${OUT}`);
