/**
 * Shared by the extension e2e tests and the store screenshot script:
 * builds the release folder, loads that exact build into Chromium, and serves fixture pages.
 *
 * One deliberate difference from the shipped build: the test copy gets a host permission
 * for 127.0.0.1. activeTab is only granted by a real click or key press in Chrome's own UI,
 * which Playwright cannot produce, so without it every scripted read would be refused.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildExtension } from './package-extension.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'extension');

/** A one-page PDF with real text, built by hand so no binary fixture lives in the repo. */
export function makePdf(lines) {
  // 12pt keeps every line inside the page; pdf.js drops glyphs that fall past the page edge.
  const stream = `BT /F1 12 Tf 72 720 Td 18 TL ${lines.map((l) => `(${l.replace(/[()\\]/g, '\\$&')}) '`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

export const PDF_LINES = [
  'Quarterly field report on river restoration.',
  'Volunteers planted four thousand willow cuttings along the banks.',
  'Water clarity improved by a third compared with last spring.',
];

export function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.endsWith('.pdf')) {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      return res.end(makePdf(PDF_LINES));
    }
    if (url.pathname === '/csp.html') {
      // As strict as real sites get: no inline styles, no inline or external scripts.
      res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'none'; style-src 'none'; script-src 'none'" });
      return res.end(fs.readFileSync(path.join(FIXTURES, 'article.html')));
    }
    const file = path.join(FIXTURES, path.basename(url.pathname) || 'article.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Build once per process, then copy into a temp dir with the test-only host permission. */
let built = null;
export async function prepareExtension() {
  built ||= await buildExtension();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'briskread-ext-'));
  fs.cpSync(built.dir, dir, { recursive: true });
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions = ['http://127.0.0.1/*'];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return { extDir: dir, build: built };
}

export async function launch({ extDir, profileDir, headless = true, viewport = { width: 1280, height: 800 }, deviceScaleFactor = 1 }) {
  const ctx = await chromium.launchPersistentContext(profileDir, {
    channel: 'chromium', // new headless mode, which supports extensions
    headless,
    viewport,
    deviceScaleFactor,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker'));
  return { ctx, sw, extId: new URL(sw.url()).host };
}

/** Fire a keyboard command (same handler Chrome calls) against the tab showing `page`. */
export async function command(sw, page, name) {
  await page.bringToFront();
  return sw.evaluate(
    async ({ url, name }) => {
      // chrome:// tabs hide their URL from extensions, so fall back to the focused tab.
      const tab = (await chrome.tabs.query({})).find((t) => t.url === url) || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
      return globalThis.__briskread.handleCommand(name, tab);
    },
    { url: page.url(), name }
  );
}

/** Fire a context-menu click (same handler Chrome calls) against the tab showing `page`. */
export async function menu(sw, page, info) {
  await page.bringToFront();
  return sw.evaluate(
    async ({ url, info }) => {
      // chrome:// tabs hide their URL from extensions, so fall back to the focused tab.
      const tab = (await chrome.tabs.query({})).find((t) => t.url === url) || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
      return globalThis.__briskread.handleMenuClick(info, tab);
    },
    { url: page.url(), info }
  );
}
