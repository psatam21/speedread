import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');

function walkHtmlFiles(dir, base = '') {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.posix.join(base, entry.name);
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkHtmlFiles(full, rel));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      results.push({ rel, full });
    }
  }
  return results;
}

function routeFromRel(rel) {
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'/index.html'.length);
  if (rel.endsWith('.html')) return '/' + rel.slice(0, -'.html'.length);
  return '/' + rel;
}

assert.ok(fs.existsSync(DIST), 'dist/ directory must exist (run npm run build first)');

const htmlFiles = walkHtmlFiles(DIST);
assert.ok(htmlFiles.length >= 24, `Expected at least 24 built HTML files, found ${htmlFiles.length}`);

const NOINDEX_ROUTES = new Set(['/404', '/account']);
const FAQ_REQUIRED_ROUTES = new Set([
  '/',
  '/rsvp-reader',
  '/bionic-reading',
  '/pdf-to-speech',
  '/reading-speed-test',
  '/words-to-minutes',
  '/teleprompter',
  '/readability-checker',
  '/how-it-works',
  '/extension',
  '/blog/best-online-speed-readers',
  '/blog/how-to-speed-read-online',
  '/blog/rsvp-reading-explained',
  '/blog/speed-read-pdf-online',
  '/blog/audio-sync-speed-reading',
  '/blog/free-online-speed-reader',
  '/blog/free-speechify-alternatives',
]);

// 1. Sitemaps & robots.txt
const sitemapXmlPath = path.join(DIST, 'sitemap.xml');
const sitemapIndexPath = path.join(DIST, 'sitemap-index.xml');
const sitemap0Path = path.join(DIST, 'sitemap-0.xml');
const robotsPath = path.join(DIST, 'robots.txt');

assert.ok(fs.existsSync(sitemapXmlPath), 'dist/sitemap.xml must exist');
assert.ok(fs.existsSync(sitemapIndexPath), 'dist/sitemap-index.xml must exist');
assert.ok(fs.existsSync(sitemap0Path), 'dist/sitemap-0.xml must exist');
assert.ok(fs.existsSync(robotsPath), 'dist/robots.txt must exist');

const sitemap0 = fs.readFileSync(sitemap0Path, 'utf8');
const robotsTxt = fs.readFileSync(robotsPath, 'utf8');
assert.match(robotsTxt, /User-agent:\s*\*/);
assert.match(robotsTxt, /Allow:\s*\//);
assert.match(robotsTxt, /Sitemap:\s*https:\/\/briskread\.com\/sitemap\.xml/);
assert.ok(!sitemap0.includes('/account'), 'sitemap-0.xml must not include /account');
assert.ok(!sitemap0.includes('/404'), 'sitemap-0.xml must not include /404');

// 2. Check redirect chains in vercel.json
const vercelConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const pathRedirects = (vercelConfig.redirects || []).filter((r) => !r.has);
const redirectSources = new Set(pathRedirects.map((r) => r.source));
for (const r of pathRedirects) {
  const destPath = r.destination.replace(/^https:\/\/briskread\.com/, '') || '/';
  assert.ok(
    !redirectSources.has(destPath),
    `Redirect chain detected in vercel.json: ${r.source} -> ${r.destination}`
  );
  assert.ok(
    !destPath.endsWith('/') || destPath === '/',
    `Redirect destination ${r.destination} must not have a trailing slash`
  );
}

// 3. WebP assets exist and are compact
for (const webpFile of ['brand-mark-96.webp', 'brand-mark.webp', 'og-default.webp', 'logo-192.webp', 'logo-512.webp']) {
  const p = path.join(DIST, 'images', webpFile);
  assert.ok(fs.existsSync(p), `dist/images/${webpFile} must exist`);
}
const logo96Size = fs.statSync(path.join(DIST, 'images', 'brand-mark-96.webp')).size;
assert.ok(logo96Size < 5000, `brand-mark-96.webp should be < 5KB, got ${logo96Size}B`);

// 4. Inspect every built HTML page
const validRoutes = new Set(htmlFiles.map((f) => routeFromRel(f.rel)));
const descriptions = new Map();
const incomingLinks = new Map();
for (const route of validRoutes) incomingLinks.set(route, new Set());

const BANNED_AI_WORDS = /\b(delve|delves|tapestry|testament|underscore|underscores|pivotal|foster|fosters|fostering|utilize|utilizes|utilizing|vibrant|realm|embark|seamless|seamlessly|game-changer|unleash|unlock|elevate|revolutionize|synergy|paramount|beacon)\b/i;

for (const { rel, full } of htmlFiles) {
  const route = routeFromRel(rel);
  const html = fs.readFileSync(full, 'utf8');
  const isNoindex = NOINDEX_ROUTES.has(route);

  // Check #5: robots meta tag (noindex vs index, follow)
  if (isNoindex) {
    assert.match(html, /<meta\b[^>]*name="robots"[^>]*content="noindex[^"]*"/i, `${route} must be noindex`);
  } else {
    assert.match(html, /<meta\b[^>]*name="robots"[^>]*content="index,\s*follow[^"]*"/i, `${route} must be index, follow`);
    assert.ok(!html.includes('noindex'), `Indexable page ${route} must not contain noindex`);
  }

  // Check #7: canonical URL without trailing slash on interior indexable pages (and omitted on noindex pages)
  const canonicalTag = html.match(/<link\b[^>]*rel="canonical"[^>]*>/i)?.[0];
  const canonicalMatch = canonicalTag?.match(/\bhref="([^"]+)"/i);
  if (!isNoindex) {
    assert.ok(canonicalMatch, `${route} must have a canonical tag`);
    const expectedCanonical = route === '/' ? 'https://briskread.com' : `https://briskread.com${route}`;
    assert.equal(canonicalMatch[1], expectedCanonical, `${route} canonical must equal ${expectedCanonical}`);
    assert.ok(
      sitemap0.includes(`<loc>${expectedCanonical}</loc>`),
      `sitemap-0.xml must include <loc>${expectedCanonical}</loc>`
    );
  } else {
    assert.equal(canonicalTag, undefined, `noindex page ${route} should not emit a canonical tag`);
  }

  // Check #9: unique meta descriptions of good length on indexable pages
  const descTag = html.match(/<meta\b[^>]*name="description"[^>]*>/i)?.[0];
  const descMatch = descTag?.match(/\bcontent="([^"]+)"/i);
  assert.ok(descMatch, `${route} must have a meta description`);
  const desc = descMatch[1];
  if (!isNoindex) {
    assert.ok(
      desc.length >= 90 && desc.length <= 165,
      `${route} meta description length (${desc.length}) should be between 90 and 165 chars: "${desc}"`
    );
    assert.ok(
      !descriptions.has(desc),
      `Duplicate meta description on ${route} and ${descriptions.get(desc)}`
    );
    descriptions.set(desc, route);
  }

  // Check #10: strictly one <h1> per page
  const h1Matches = html.match(/<h1\b[^>]*>/gi) || [];
  assert.equal(h1Matches.length, 1, `${route} must have exactly 1 <h1>, found ${h1Matches.length}`);

  // Parse all JSON-LD blocks
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) =>
    JSON.parse(m[1])
  );
  const ldTypes = new Set(ldBlocks.map((b) => b['@type']));

  // Check #11: FAQPage schema on required pages
  if (FAQ_REQUIRED_ROUTES.has(route)) {
    const faqLd = ldBlocks.find((b) => b['@type'] === 'FAQPage');
    assert.ok(faqLd, `${route} must emit FAQPage JSON-LD schema`);
    assert.ok(
      Array.isArray(faqLd.mainEntity) && faqLd.mainEntity.length >= 3,
      `${route} FAQPage schema must have at least 3 questions`
    );
  }

  // Check #12: Breadcrumbs on all interior indexable pages
  if (!isNoindex && route !== '/') {
    assert.match(html, /<nav class="breadcrumbs\b[^"]*" aria-label="Breadcrumb"[^>]*>/, `${route} must have visible breadcrumbs`);
    const bcLd = ldBlocks.find((b) => b['@type'] === 'BreadcrumbList');
    assert.ok(bcLd, `${route} must emit BreadcrumbList JSON-LD schema`);
    for (const item of bcLd.itemListElement) {
      assert.ok(
        !item.item.endsWith('/'),
        `${route} BreadcrumbList item URL must not end with trailing slash: ${item.item}`
      );
    }
  }

  // Check #14 & #15: All <img> tags have alt, width, height, and use WebP for raster images
  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  for (const img of imgTags) {
    const altMatch = img.match(/\balt="([^"]*)"/i);
    assert.ok(altMatch && altMatch[1].trim().length > 0, `${route} has <img> without descriptive alt: ${img}`);
    assert.match(img, /\bwidth="\d+"/i, `${route} has <img> without explicit width: ${img}`);
    assert.match(img, /\bheight="\d+"/i, `${route} has <img> without explicit height: ${img}`);
    assert.ok(!img.includes('.png'), `${route} <img> should use .webp instead of .png: ${img}`);
  }

  // Check #8 & #13: Internal links resolve without 404 or redirect chains
  const hrefMatches = [...html.matchAll(/\bhref="(\/[^"#?]*)(?:[?#][^"]*)?"/gi)];
  for (const m of hrefMatches) {
    const target = m[1];
    if (target === '/cdn-cgi/l/email-protection') continue;
    assert.ok(
      target === '/' || !target.endsWith('/'),
      `${route} has internal link with trailing slash: ${target}`
    );
    assert.ok(
      !redirectSources.has(target),
      `${route} links to redirected URL ${target} (causes redirect hop)`
    );
    const assetPath = path.join(DIST, target);
    const existsAsRouteOrAsset = validRoutes.has(target) || fs.existsSync(assetPath);
    assert.ok(existsAsRouteOrAsset, `${route} has broken internal link to ${target}`);
    if (validRoutes.has(target) && target !== route) {
      incomingLinks.get(target).add(route);
    }
  }

  // Check #18: Banned AI vocabulary in visible body text (strip scripts and styles)
  const visibleText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const aiMatch = visibleText.match(BANNED_AI_WORDS);
  assert.equal(aiMatch, null, `${route} contains banned AI word "${aiMatch?.[0]}"`);

  // Check #19: Author bio & Person schema on blog posts and /about
  if ((route.startsWith('/blog/') && route !== '/blog') || route === '/about') {
    assert.match(html, /Prathamesh Satam/, `${route} must credit author Prathamesh Satam`);
    assert.match(html, /class="[^"]*author-(?:bio|card)[^"]*"/, `${route} must render a visible author bio card`);
  }
}

// Check #13: No orphan indexable pages (every indexable page has >= 2 incoming internal links)
for (const route of validRoutes) {
  if (NOINDEX_ROUTES.has(route)) continue;
  const inCount = incomingLinks.get(route)?.size || 0;
  assert.ok(inCount >= 2, `Orphan page check failed: ${route} only has ${inCount} incoming internal links`);
}

// Check #16: Pre-rendered initial tool outputs (zero hydration layout shift)
const bionicHtml = fs.readFileSync(path.join(DIST, 'bionic-reading', 'index.html'), 'utf8');
assert.match(bionicHtml, /id="bionic-output"[^>]*><strong>Read<\/strong>ing/, '/bionic-reading must pre-render initial bionic sample');

const w2mHtml = fs.readFileSync(path.join(DIST, 'words-to-minutes', 'index.html'), 'utf8');
assert.match(w2mHtml, /id="w2m-reverse"[^>]*>Speaking, average/, '/words-to-minutes must pre-render initial reverse calculation');

const rcHtml = fs.readFileSync(path.join(DIST, 'readability-checker', 'index.html'), 'utf8');
assert.ok(!rcHtml.includes('id="rc-fre">--</p>'), '/readability-checker must pre-render initial Flesch score');
assert.match(rcHtml, /id="rc-highlight"[^>]*><span class="rc-cx">Readability<\/span>/, '/readability-checker must pre-render highlighted sample text');

// Check #20: Editorial / Press & Citations section on /about
const aboutHtml = fs.readFileSync(path.join(DIST, 'about', 'index.html'), 'utf8');
assert.match(aboutHtml, /id="press"/, '/about must include #press section for journalist/editorial citations');

console.log(`SEO & Performance 20-point checklist passed across ${htmlFiles.length} built pages.`);
