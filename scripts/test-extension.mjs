/**
 * End-to-end tests for the Chrome extension, run against the packaged build
 * (release/briskread-extension-vX.Y.Z/) loaded into Chromium.
 *   npm run ext:test
 * Covers read-in-place, selection reading (incl. iframes), read-later, shortcuts,
 * settings persistence across a browser restart, resume, page bionic, PDFs,
 * blocked pages, strict CSP pages and SPAs, plus the shipped build under a real
 * activeTab grant. See chrome-extension/store/QA.md for what still needs a human
 * (real key presses, right-click menus, audio).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareExtension, launch, startServer, command, menu, PDF_LINES } from './extension-harness.mjs';

let ext;
let server;
let base;
let profileDir;
let ctx;
let sw;
let extId;

async function start() {
  ({ ctx, sw, extId } = await launch({ extDir: ext.extDir, profileDir }));
  // "Speed read linked page" opens briskread.com; keep the suite offline.
  await ctx.route('https://briskread.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>BriskRead stub</title>' }));
}

before(async () => {
  ext = await prepareExtension();
  server = await startServer();
  base = `http://127.0.0.1:${server.address().port}`;
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'briskread-profile-'));
  await start();
});

after(async () => {
  await ctx?.close();
  server?.close();
});

/* ---------- helpers ---------- */

const ui = (page) => page.locator('briskread-overlay');
let opened = 0;
async function open(file = 'article.html') {
  const page = await ctx.newPage();
  // A unique URL per tab, so the worker never acts on an earlier test's tab.
  await page.goto(`${base}/${file}?tab=${(opened += 1)}`);
  return page;
}

async function read(page) {
  await command(sw, page, 'speed-read-tab');
  await ui(page).locator('.wrap').waitFor();
  return page;
}

async function pauseAfterAutoplay(page) {
  await ui(page).locator('.play[aria-label="Pause"]').waitFor();
  await page.keyboard.press(' ');
  await ui(page).locator('.play[aria-label="Play"]').waitFor();
}

const wordCount = async (page) => Number((await ui(page).locator('.doc-meta').textContent()).match(/^([\d,]+) words/)[1].replace(/,/g, ''));
const position = async (page) => Number((await ui(page).locator('.pos').textContent()).match(/· ([\d,]+) \//)[1].replace(/,/g, '')) - 1;
const storage = (keys) => sw.evaluate((k) => chrome.storage.local.get(k), keys);

/* ---------- tests ---------- */

test('ships a minimal, store-valid manifest', () => {
  const m = ext.build.manifest;
  assert.deepEqual([...m.permissions].sort(), ['activeTab', 'contextMenus', 'scripting', 'storage']);
  for (const key of ['host_permissions', 'optional_host_permissions', 'content_scripts', 'web_accessible_resources']) {
    assert.equal(m[key], undefined, `${key} should not be declared`);
  }
  assert.deepEqual(ext.build.problems, []);
  assert.ok(m.description.length <= 132);
  assert.deepEqual(
    Object.fromEntries(Object.entries(m.commands).map(([k, v]) => [k, v.suggested_key.default])),
    { 'speed-read-tab': 'Alt+Shift+S', 'bionic-tab': 'Alt+Shift+K', 'read-later-tab': 'Alt+Shift+L' }
  );
  assert.ok(fs.existsSync(ext.build.zipPath));
});

test('Chrome actually assigns every suggested shortcut (none clash with Chrome’s own)', async () => {
  const commands = await sw.evaluate(() => chrome.commands.getAll());
  const assigned = Object.fromEntries(commands.filter((c) => c.name !== '_execute_action').map((c) => [c.name, c.shortcut]));
  assert.deepEqual(assigned, { 'speed-read-tab': 'Alt+Shift+S', 'bionic-tab': 'Alt+Shift+K', 'read-later-tab': 'Alt+Shift+L' });
});

test('install opens the welcome page, and its demo plays', async () => {
  const welcome =
    ctx.pages().find((p) => p.url().includes('options.html')) ||
    (await ctx.waitForEvent('page', { predicate: (p) => p.url().includes('options.html') }));
  await welcome.waitForLoadState();
  assert.ok(welcome.url().endsWith('options.html#welcome'));
  await welcome.locator('#welcome').waitFor();
  const [demo] = await Promise.all([ctx.waitForEvent('page'), welcome.click('#btn-demo')]);
  await ui(demo).locator('.wrap').waitFor();
  assert.equal(await ui(demo).locator('.doc-title').textContent(), 'Welcome to BriskRead');
  await demo.close();
  await welcome.close();
});

test('shortcut reads the article in place and keeps page chrome out', async () => {
  const page = await read(await open());
  assert.match(await ui(page).locator('.doc-title').textContent(), /Quiet Mechanics of Reading Faster/);
  const n = await wordCount(page);
  assert.ok(n > 350 && n < 600, `article word count ${n}`);

  await pauseAfterAutoplay(page);
  const at = await position(page);
  await page.keyboard.press('ArrowRight');
  assert.equal(await position(page), at + 10);
  await page.keyboard.press('ArrowUp');
  assert.equal(await ui(page).locator('.wpm').textContent(), '375');
  await page.keyboard.press('ArrowDown');

  await page.keyboard.press('2'); // Focus mode shows the extracted text
  const text = await ui(page).locator('.v-text').textContent();
  assert.match(text, /backward glances/);
  assert.doesNotMatch(text, /Join the newsletter|fictional publication|Archive/);

  // Typing in the reader never reaches the host page's own shortcuts.
  await ui(page).locator('[data-act="ai"]').click();
  await ui(page).locator('.ai-input').type('what is this about');
  assert.deepEqual(await page.evaluate(() => window.__pageKeys), []);

  await page.keyboard.press('Escape'); // closes the AI panel
  assert.equal(await ui(page).count(), 1);
  await page.keyboard.press('Escape'); // closes the reader
  assert.equal(await ui(page).count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '');
  await page.close();
});

test('reads only the selection when text is selected', async () => {
  const page = await open();
  const expected = await page.evaluate(() => {
    const p = document.getElementById('p2');
    const r = document.createRange();
    r.selectNodeContents(p);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return p.textContent.trim().split(/\s+/).length;
  });
  await read(page);
  assert.equal(await wordCount(page), expected);
  await page.close();
});

test('context-menu selection inside an iframe reads that frame only, paragraphs intact', async () => {
  const page = await open('iframe.html');
  const frame = page.frame({ url: /\/frame\.html/ });
  const expected = await frame.evaluate(() => {
    const r = document.createRange();
    r.setStartBefore(document.getElementById('f1'));
    r.setEndAfter(document.getElementById('f2'));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    return document.body.textContent.trim().split(/\s+/).length;
  });
  const frameId = await sw.evaluate(async (url) => {
    const tab = (await chrome.tabs.query({})).find((t) => t.url === url);
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => location.href });
    return results.find((r) => r.result.endsWith('frame.html')).frameId;
  }, page.url());

  await menu(sw, page, { menuItemId: 'br-selection', frameId, selectionText: 'flattened copy from chrome' });
  await ui(page).locator('.wrap').waitFor();
  assert.equal(await wordCount(page), expected);
  await page.keyboard.press(' ');
  await page.keyboard.press('2');
  assert.equal(await ui(page).locator('.v-text p').count(), 2);
  await page.close();
});

test('read later: shortcut saves, re-saving does not duplicate, popup lists, opens and removes', async () => {
  const page = await open();
  const saved = await command(sw, page, 'read-later-tab');
  assert.equal(saved.ok, true);
  await command(sw, page, 'read-later-tab');
  let { sr_read_later: list } = await storage('sr_read_later');
  assert.equal(list.length, 1);
  assert.match(list[0].title, /Quiet Mechanics/);
  assert.ok(list[0].wordCount > 350);

  await menu(sw, page, { menuItemId: 'br-later', linkUrl: 'https://example.com/long-read' });
  ({ sr_read_later: list } = await storage('sr_read_later'));
  assert.equal(list.length, 2);
  assert.equal(list[0].url, 'https://example.com/long-read');

  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.locator('.q-item').nth(1).waitFor();
  assert.equal(await popup.locator('.q-item').count(), 2);
  assert.match(await popup.locator('.q-item').nth(1).textContent(), /Quiet Mechanics/);

  // "Read" on a saved article opens it in the reader on the chosen tab (the popup's SR_READ_TAB path).
  const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id, page.url());
  await popup.evaluate(
    async ({ tabId, item }) => chrome.runtime.sendMessage({ type: 'SR_READ_TAB', tabId, article: item }),
    { tabId, item: list[1] }
  );
  await ui(page).locator('.wrap').waitFor();
  assert.equal(await wordCount(page), list[1].wordCount);

  await popup.locator('.q-item [data-act="remove"]').first().click();
  await popup.locator('.q-item [data-act="remove"]').first().click();
  await popup.locator('#queue-empty').waitFor();
  await popup.close();
  await page.close();
});

test('popup buttons read, bionic-toggle and save the page they were opened on', async () => {
  const page = await open();
  const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id, page.url());
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${tabId}`);
  assert.match(await popup.locator('#tab-title').textContent(), /Quiet Mechanics/);
  assert.equal(await popup.locator('kbd[data-cmd="speed-read-tab"]').textContent(), 'Alt+Shift+S');
  assert.equal(await popup.locator('kbd[data-cmd="bionic-tab"]').textContent(), 'Alt+Shift+K');

  await popup.click('#btn-bionic');
  await popup.locator('#status', { hasText: 'Bionic reading is on' }).waitFor();
  assert.ok((await page.locator('brisk-b').count()) > 300);

  await popup.click('#btn-save');
  await popup.locator('#status', { hasText: 'Saved to read later' }).waitFor();
  await popup.locator('.q-item').first().waitFor();

  await popup.click('#btn-read');
  await ui(page).locator('.wrap').waitFor();
  await sw.evaluate(() => chrome.storage.local.remove('sr_read_later'));
  if (!popup.isClosed()) await popup.close();
  await page.close();
});

test('read-later queue caps size instead of overflowing storage', async () => {
  const result = await sw.evaluate(async () => {
    for (let i = 0; i < 55; i += 1) {
      await srAddReadLater({ title: `Item ${i}`, text: 'lorem '.repeat(60000), url: `https://example.com/${i}` });
    }
    const list = await srListReadLater();
    await chrome.storage.local.remove('sr_read_later');
    return { length: list.length, longest: Math.max(...list.map((x) => x.text.length)), newest: list[0].title };
  });
  assert.equal(result.length, 50);
  assert.ok(result.longest <= 180_000);
  assert.equal(result.newest, 'Item 54');
});

test('settings persist across reader sessions and a full browser restart', async () => {
  let page = await read(await open());
  await pauseAfterAutoplay(page);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('2');
  await ui(page).locator('[data-act="settings"]').click();
  await ui(page).locator('[data-set="theme"][data-value="sepia"]').click();
  await ui(page).locator('[data-set="size"][data-value="l"]').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  const check = async (p) => {
    await read(p);
    assert.equal(await ui(p).locator('.wpm').textContent(), '400');
    assert.equal(await ui(p).locator('.seg [data-mode="focus"]').getAttribute('aria-selected'), 'true');
    assert.equal(await ui(p).locator('.wrap').getAttribute('data-theme'), 'sepia');
    assert.equal(await ui(p).locator('.wrap').getAttribute('data-size'), 'l');
  };
  await check(page);
  await page.close();

  await ctx.close();
  await start();
  page = await open();
  await check(page);
  const options = await ctx.newPage();
  await options.goto(`chrome-extension://${extId}/options.html`);
  assert.equal(await options.locator('#wpm').inputValue(), '400');
  assert.equal(await options.locator('#theme').inputValue(), 'sepia');
  await options.close();
  await page.close();
  await sw.evaluate(() => chrome.storage.local.remove('sr_settings'));
});

test('resumes where the reader stopped, with a way to start over', async () => {
  const url = `${base}/article.html?resume`; // same URL both times: progress is keyed by URL
  let page = await ctx.newPage();
  await page.goto(url);
  await read(page);
  await pauseAfterAutoplay(page);
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowRight');
  const stoppedAt = await position(page);
  await page.keyboard.press('Escape');
  await page.close();

  page = await ctx.newPage();
  await page.goto(url);
  await read(page);
  await ui(page).locator('.toast', { hasText: 'Resumed at' }).waitFor();
  const resumedAt = await position(page);
  assert.ok(resumedAt >= stoppedAt && resumedAt < stoppedAt + 15, `resumed at ${resumedAt}, stopped at ${stoppedAt}`);
  await ui(page).locator('.toast button', { hasText: 'Start over' }).click();
  assert.ok((await position(page)) < 5);
  await page.close();
});

test('bionic on the live page toggles on, follows new content, and restores the DOM exactly', async () => {
  const page = await open();
  const before = await page.evaluate(() => ({ html: document.body.innerHTML, text: document.body.innerText }));
  assert.deepEqual(await command(sw, page, 'bionic-tab'), { ok: true, on: true });
  const on = await page.evaluate(() => ({
    bolded: document.querySelectorAll('brisk-b').length,
    inCode: document.querySelectorAll('pre brisk-b, input brisk-b, script brisk-b').length,
    text: document.body.innerText,
  }));
  assert.ok(on.bolded > 300, `bolded ${on.bolded}`);
  assert.equal(on.inCode, 0);
  assert.equal(on.text, before.text, 'visible text must not change');

  await page.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'late';
    p.textContent = 'Infinite scroll appended this paragraph later.';
    document.querySelector('article').append(p);
  });
  await page.waitForFunction(() => document.querySelectorAll('#late brisk-b').length === 6);

  assert.deepEqual(await command(sw, page, 'bionic-tab'), { ok: true, on: false });
  const after = await page.evaluate(() => {
    document.getElementById('late').remove();
    return { html: document.body.innerHTML, bolded: document.querySelectorAll('brisk-b').length };
  });
  assert.equal(after.bolded, 0);
  assert.equal(after.html, before.html);
  await page.close();
});

test('PDF in Chrome’s viewer opens in the reader tab with its text', async () => {
  const page = await ctx.newPage();
  await page.goto(`${base}/report.pdf`).catch(() => {});
  const readerOpened = ctx.waitForEvent('page', { predicate: (p) => p.url().includes('reader.html') });
  await command(sw, page, 'speed-read-tab');
  const reader = await readerOpened;
  await ui(reader).locator('.wrap').waitFor({ timeout: 20_000 });
  assert.equal(await ui(reader).locator('.doc-title').textContent(), 'report.pdf');
  assert.equal(await wordCount(reader), PDF_LINES.join(' ').split(/\s+/).length);
  await reader.close();
  await page.close();
});

test('blocked browser pages explain themselves instead of failing silently', async () => {
  const page = await ctx.newPage();
  await page.goto('chrome://version');
  const readerOpened = ctx.waitForEvent('page', { predicate: (p) => p.url().includes('reader.html') });
  await command(sw, page, 'speed-read-tab');
  const reader = await readerOpened;
  await reader.locator('#notice').waitFor();
  assert.match(await reader.locator('#notice').textContent(), /does not let extensions read this page/);
  await reader.locator('#paste').fill('Pasted words can still be speed read from here even on blocked pages.');
  await reader.click('#btn-paste');
  await ui(reader).locator('.wrap').waitFor();
  assert.equal(await wordCount(reader), 13);
  await reader.close();
  await page.close();
});

test('strict-CSP pages still get the fully styled reader', async () => {
  const page = await read(await open('csp.html'));
  const look = await page.evaluate(() => {
    const root = document.querySelector('briskread-overlay').shadowRoot;
    const wrap = getComputedStyle(root.querySelector('.wrap'));
    const play = root.querySelector('.play').getBoundingClientRect();
    return { bg: wrap.backgroundColor, position: wrap.position, play: Math.round(play.width) };
  });
  assert.notEqual(look.bg, 'rgba(0, 0, 0, 0)');
  assert.equal(look.position, 'fixed');
  assert.equal(look.play, 48);
  await page.close();
});

test('SPA: reads the view on screen now, not the first one', async () => {
  const page = await open('spa.html');
  await page.click('#go');
  await read(page);
  assert.equal(await ui(page).locator('.doc-title').textContent(), 'View B headline');
  await page.close();
});

test('read aloud never freezes the reader (works, or falls back to silent reading)', async () => {
  const page = await read(await open());
  await pauseAfterAutoplay(page);
  const voices = await page.evaluate(() => speechSynthesis.getVoices().length);
  await page.keyboard.press('a');
  if (!voices) {
    await ui(page).locator('.toast', { hasText: 'No speech voices' }).waitFor();
    assert.equal(await ui(page).locator('[data-act="audio"]').getAttribute('aria-pressed'), 'false');
    return page.close();
  }
  assert.equal(await ui(page).locator('[data-act="audio"]').getAttribute('aria-pressed'), 'true');
  const from = await position(page);
  await ui(page).locator('.play').click(); // a click inside the page satisfies Chrome's user-activation rule for speech
  // Headless Chrome may have voices but no audio device; either way the words must keep moving.
  await page.waitForFunction(
    (start) => {
      const pos = document.querySelector('briskread-overlay')?.shadowRoot.querySelector('.pos')?.textContent || '';
      return Number((pos.match(/· ([\d,]+) \//) || [])[1]?.replace(/,/g, '')) - 1 >= start + 8;
    },
    from,
    { timeout: 20_000 }
  );
  await page.keyboard.press('Escape');
  await page.close();
});

test('AI without a key explains how to add one', async () => {
  const page = await read(await open());
  await pauseAfterAutoplay(page);
  await ui(page).locator('[data-act="ai"]').click();
  await ui(page).locator('[data-act="summary"]').click();
  await ui(page).locator('.msg.err', { hasText: 'Gemini API key' }).waitFor();
  assert.equal(await ui(page).locator('.msg.err [data-act="options"]').count(), 1);
  await page.close();
});

test('"Speed read linked page" hands the link to briskread.com', async () => {
  const page = await open();
  const opened = ctx.waitForEvent('page');
  await menu(sw, page, { menuItemId: 'br-link', linkUrl: 'https://example.com/story?id=7' });
  const site = await opened;
  await site.waitForLoadState();
  assert.equal(site.url(), 'https://briskread.com/?url=https%3A%2F%2Fexample.com%2Fstory%3Fid%3D7');
  await site.close();
  await page.close();
});

test('shipped build: a real toolbar click grants activeTab, and read, bionic, save, selection and PDF all work', async () => {
  // The exact release folder, with no test permission. Extensions.triggerAction is Chrome's own
  // "user clicked the toolbar icon" path, so this is the activeTab grant real users get.
  const prod = await launch({
    extDir: ext.build.dir,
    profileDir: fs.mkdtempSync(path.join(os.tmpdir(), 'briskread-prod-')),
    args: ['--enable-unsafe-extension-debugging'],
  });
  const cdp = await prod.ctx.browser().newBrowserCDPSession();
  const clickToolbar = async (page) => {
    await page.bringToFront(); // the action runs on the active tab, like a real click
    const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
    const tab = targetInfos.find((t) => t.url === page.url());
    await cdp.send('Extensions.triggerAction', { id: prod.extId, targetId: tab.targetId });
  };
  try {
    const page = await prod.ctx.newPage();
    await page.goto(`${base}/article.html?prod`);
    assert.equal(await prod.sw.evaluate(async () => (await chrome.tabs.query({})).some((t) => t.url?.includes('prod'))), false, 'no access before the click');

    await clickToolbar(page);
    await command(prod.sw, page, 'speed-read-tab');
    await ui(page).locator('.wrap').waitFor();
    assert.ok((await wordCount(page)) > 350);
    await page.keyboard.press('Escape');
    assert.deepEqual(await command(prod.sw, page, 'bionic-tab'), { ok: true, on: true });
    assert.equal((await command(prod.sw, page, 'read-later-tab')).ok, true);
    await page.evaluate(() => {
      const r = document.createRange();
      r.selectNodeContents(document.getElementById('p2'));
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
    await command(prod.sw, page, 'speed-read-tab');
    await ui(page).locator('.wrap').waitFor();
    assert.ok((await wordCount(page)) < 100, 'selection only');

    const pdf = await prod.ctx.newPage();
    await pdf.goto(`${base}/report.pdf?prod`).catch(() => {});
    await pdf.waitForTimeout(500);
    await clickToolbar(pdf);
    const readerOpened = prod.ctx.waitForEvent('page', { predicate: (p) => p.url().includes('reader.html') });
    await command(prod.sw, pdf, 'speed-read-tab');
    const reader = await readerOpened;
    await ui(reader).locator('.wrap').waitFor({ timeout: 20_000 });
    assert.equal(await wordCount(reader), PDF_LINES.join(' ').split(/\s+/).length);
  } finally {
    await prod.ctx.close();
  }
});
