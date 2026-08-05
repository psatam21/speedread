/**
 * Full-site visual + console audit for BriskRead (local or production).
 * Usage: node scripts/site-audit.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = (process.argv[2] || 'http://localhost:4321').replace(/\/$/, '');
const outDir = path.resolve('audit-output');
fs.mkdirSync(outDir, { recursive: true });

const paths = [
  '/',
  '/about',
  '/account',
  '/bionic-reading',
  '/bionic-reading-converter',
  '/blog',
  '/blog/audio-sync-speed-reading',
  '/blog/best-online-speed-readers',
  '/blog/how-to-speed-read-online',
  '/blog/rsvp-reading-explained',
  '/blog/speed-read-pdf-online',
  '/contact',
  '/extension',
  '/how-it-works',
  '/pdf-to-speech',
  '/privacy',
  '/reading-speed-test',
  '/rsvp-reader',
  '/terms',
  '/not-a-real-page-404-check',
];

const issues = [];
const summary = [];

function pushIssue(pagePath, severity, message, detail = '') {
  issues.push({ page: pagePath, severity, message, detail });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

page.on('pageerror', (err) => {
  pushIssue(page.url().replace(base, '') || '/', 'error', 'Uncaught page error', String(err.message || err));
});

for (const p of paths) {
  const url = `${base}${p}`;
  const slug = p === '/' ? 'home' : p.replace(/^\//, '').replace(/\//g, '__');
  const consoleErrors = [];
  const consoleWarnings = [];
  const failedRequests = [];

  const onConsole = (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') consoleErrors.push(text);
    if (type === 'warning') consoleWarnings.push(text);
  };
  const onFail = (req) => {
    const failure = req.failure();
    if (failure) failedRequests.push({ url: req.url(), error: failure.errorText });
  };
  const onResponse = (res) => {
    const status = res.status();
    if (status >= 400 && !res.url().includes('favicon')) {
      failedRequests.push({ url: res.url(), error: `HTTP ${status}` });
    }
  };

  page.on('console', onConsole);
  page.on('requestfailed', onFail);
  page.on('response', onResponse);

  let status = 0;
  let title = '';
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    status = res?.status() || 0;
    title = await page.title();
    await page.waitForTimeout(600);
    // Scroll full page to surface lazy/layout issues
    await page.evaluate(async () => {
      const delay = (ms) => new Promise((r) => setTimeout(r, ms));
      const h = document.body.scrollHeight;
      for (let y = 0; y < h; y += 500) {
        window.scrollTo(0, y);
        await delay(80);
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(300);

    const metrics = await page.evaluate(() => {
      const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      const imgs = [...document.images].map((img) => ({
        src: img.currentSrc || img.src,
        ok: img.complete && img.naturalWidth > 0,
        alt: img.alt,
        w: img.naturalWidth,
        h: img.naturalHeight,
      }));
      const brokenImgs = imgs.filter((i) => !i.ok);
      const emptyAlts = imgs.filter((i) => i.ok && i.alt === undefined);
      const h1 = [...document.querySelectorAll('h1')].map((el) => el.textContent?.trim()).filter(Boolean);
      const main = document.querySelector('main');
      const logo = document.querySelector('.logo-mark-img, .logo-mark, .logo-container img');
      const faviconLinks = [...document.querySelectorAll('link[rel*="icon"]')].map((l) => l.href);
      const skip = document.querySelector('.skip-link');
      const nav = document.querySelector('nav.nav-links, nav');
      // Overlapping fixed header content check
      const header = document.querySelector('.site-header');
      const headerH = header ? header.getBoundingClientRect().height : 0;
      // Text contrast-ish: zero size buttons
      const zeroButtons = [...document.querySelectorAll('button, a.nav-cta')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height === 0;
      }).length;
      // Horizontal overflow culprits
      let maxRight = 0;
      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right > maxRight) maxRight = r.right;
      });
      return {
        overflowX,
        maxRight,
        viewportW: window.innerWidth,
        brokenImgs: brokenImgs.slice(0, 10),
        h1,
        hasMain: !!main,
        hasLogo: !!logo,
        logoSrc: logo?.getAttribute?.('src') || logo?.src || null,
        faviconLinks,
        hasSkip: !!skip,
        hasNav: !!nav,
        headerH,
        zeroButtons,
        bodyTextLen: (document.body.innerText || '').trim().length,
      };
    });

    const shotPath = path.join(outDir, `${slug}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });

    const pageIssues = [];
    if (p.includes('404')) {
      if (status !== 404 && !title.toLowerCase().includes('not found') && !title.includes('404')) {
        // Astro SPA may return 200 for client 404
        pageIssues.push({ severity: 'warn', message: `404 route returned status ${status}`, detail: title });
      }
    } else if (status >= 400) {
      pageIssues.push({ severity: 'error', message: `HTTP ${status}`, detail: url });
    }
    if (!metrics.hasMain) pageIssues.push({ severity: 'error', message: 'Missing <main>' });
    if (!metrics.h1.length) pageIssues.push({ severity: 'warn', message: 'No H1 on page' });
    if (metrics.h1.length > 1) pageIssues.push({ severity: 'warn', message: `Multiple H1s (${metrics.h1.length})`, detail: metrics.h1.join(' | ') });
    if (metrics.overflowX) pageIssues.push({ severity: 'error', message: 'Horizontal overflow', detail: `maxRight=${metrics.maxRight} vw=${metrics.viewportW}` });
    if (metrics.brokenImgs.length) pageIssues.push({ severity: 'error', message: 'Broken images', detail: JSON.stringify(metrics.brokenImgs) });
    if (!metrics.hasLogo && !p.includes('404')) pageIssues.push({ severity: 'warn', message: 'Logo mark not found in header' });
    if (metrics.logoSrc && metrics.logoSrc.includes('brand-mark')) {
      // good
    }
    if (metrics.bodyTextLen < 40 && !p.includes('404')) pageIssues.push({ severity: 'warn', message: 'Very little body text', detail: String(metrics.bodyTextLen) });
    if (metrics.zeroButtons) pageIssues.push({ severity: 'warn', message: `Zero-height interactive elements: ${metrics.zeroButtons}` });

    // Filter noise: third-party / browser extensions
    const realErrors = consoleErrors.filter((t) =>
      !t.includes('favicon') &&
      !t.includes('net::ERR_BLOCKED') &&
      !t.includes('AdSense') &&
      !t.includes('googleads') &&
      !t.includes('googletagmanager') &&
      !t.includes('chrome-extension')
    );
    const realFails = failedRequests.filter((f) =>
      !f.url.includes('google') &&
      !f.url.includes('doubleclick') &&
      !f.url.includes('adsense') &&
      !f.url.includes('chrome-extension') &&
      !f.url.includes('sentry')
    );
    for (const e of realErrors.slice(0, 8)) {
      pageIssues.push({ severity: 'error', message: 'Console error', detail: e.slice(0, 300) });
    }
    for (const f of realFails.slice(0, 8)) {
      pageIssues.push({ severity: 'error', message: 'Failed request', detail: `${f.error} ${f.url}`.slice(0, 300) });
    }

    for (const issue of pageIssues) {
      pushIssue(p, issue.severity, issue.message, issue.detail || '');
    }

    summary.push({
      path: p,
      status,
      title,
      issues: pageIssues.length,
      h1: metrics.h1[0] || null,
      logo: metrics.logoSrc,
      screenshot: shotPath,
    });
    console.log(`${status} ${p} — ${pageIssues.length} issue(s) — ${title}`);
  } catch (err) {
    pushIssue(p, 'error', 'Navigation failed', String(err.message || err));
    summary.push({ path: p, status: 0, title: '', issues: 1, error: String(err.message || err) });
    console.log(`FAIL ${p} — ${err.message}`);
  } finally {
    page.off('console', onConsole);
    page.off('requestfailed', onFail);
    page.off('response', onResponse);
  }
}

// Mobile pass on home + account + pricing-critical pages
const mobile = await context.newPage();
await mobile.setViewportSize({ width: 390, height: 844 });
for (const p of ['/', '/account', '/how-it-works', '/extension', '/blog']) {
  try {
    await mobile.goto(`${base}${p}`, { waitUntil: 'networkidle', timeout: 45000 });
    await mobile.waitForTimeout(400);
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    const shot = path.join(outDir, `mobile${p === '/' ? '__home' : p.replace(/\//g, '__')}.png`);
    await mobile.screenshot({ path: shot, fullPage: true });
    if (overflow) pushIssue(p, 'error', 'Mobile horizontal overflow');
    console.log(`mobile ${p} overflow=${overflow}`);
  } catch (err) {
    pushIssue(p, 'error', 'Mobile navigation failed', String(err.message || err));
  }
}

await browser.close();

const report = { base, generatedAt: new Date().toISOString(), summary, issues };
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
const md = [
  `# Site audit — ${base}`,
  '',
  `Generated: ${report.generatedAt}`,
  '',
  `## Totals: ${issues.filter((i) => i.severity === 'error').length} errors, ${issues.filter((i) => i.severity === 'warn').length} warnings`,
  '',
  '## Per page',
  ...summary.map((s) => `- \`${s.path}\` status=${s.status} issues=${s.issues} h1=${JSON.stringify(s.h1)}`),
  '',
  '## Issues',
  ...issues.map((i) => `- **[${i.severity}]** \`${i.page}\` — ${i.message}${i.detail ? `: ${i.detail.slice(0, 200)}` : ''}`),
  '',
].join('\n');
fs.writeFileSync(path.join(outDir, 'report.md'), md);
console.log('\nWrote', path.join(outDir, 'report.md'));
console.log(`Errors: ${issues.filter((i) => i.severity === 'error').length}, Warnings: ${issues.filter((i) => i.severity === 'warn').length}`);
process.exit(issues.some((i) => i.severity === 'error') ? 1 : 0);
