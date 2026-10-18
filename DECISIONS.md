# DECISIONS.md - BriskRead (speedread)

## Current state
**Goal:** Grow organic search traffic to briskread.com, a free, ad-supported online speed reader (Astro 7 static site on Vercel), and redesign it to feel clearly premium.
**Deadline:** none
**Where we are:** 2026-10-19: SEO audit + fixes, performance fixes, Prathamesh Satam as blog author, and the bionic converter merge are all applied locally, built, tested and re-crawled clean (21 pages). NOT committed or deployed. A redesign is next: a research agent is shortlisting references from styles.refero.design (DESIGN.md files); directions go to Prathamesh to pick before any restyling. After deploy: resubmit sitemap-index.xml in Search Console and request indexing for /, /rsvp-reader, /pdf-to-speech, /bionic-reading.
**Open questions:**
- Homepage testimonials (Priya M., Marcus B., etc.) look like placeholders. If not real users, they are a legal risk (FTC fake-review rule) and should go.
- AdSense is not live: PUBLIC_ADSENSE_CLIENT_ID is unset on Vercel, so the site earns nothing from ads today.
- Defer GA4 until after page load? Saves roughly 250ms of main-thread blocking but may drop pageviews from very fast bounces.
- Content work not started: expand thin tool pages (rsvp-reader, pdf-to-speech), add a real named competitor list to /blog/best-online-speed-readers, add an author bio + LinkedIn on /about#author.

## Decision log
### 2026-10-19 - Blog author is Prathamesh Satam; bionic converter merged into /bionic-reading
**Decided:** (Prathamesh's call) Posts carry a Person author "Prathamesh Satam" in BlogPosting schema, the visible byline and meta author, linking to /about#author. /bionic-reading-converter is deleted; its converter widget and copy now live on /bionic-reading, the old URL 308s there, and all links point to /bionic-reading#converter.
**Why:** A named author is a stronger trust signal than an Organization. The two bionic pages competed for the same queries and only the converter page had a working tool.
**Consequence:** New posts get the author automatically via BlogPost.astro (AUTHOR constant). /bionic-reading owns both "bionic reading online" and "bionic text converter".

### 2026-10-19 - Performance fixes; hero entrance animation removed
**Decided:** Logo served as a 4 KB 96px PNG (was 561 KB at 28px, 58% of page weight). Inter 400/600 preloaded (the font swap was the only layout shift). Merriweather loads only when the reader's serif option is on. Root JS is network-first in the service worker (cache renamed briskread-v3). /images cached 7 days. Ad placeholders show only in dev. Hero copy no longer hides and replays after load.
**Why:** The hero text painted, vanished when a deferred script added .is-ready, then animated back in, a visible flash that also pushes LCP later. Cache-first root JS could pair new HTML with old JS after a deploy. Production showed dashed "Reserved advertisement space" boxes.
**Consequence:** Rejected for now: moving the Supabase client off non-account pages (53 KB gz, no measured speed gain, auth timing risk) and colour-contrast token changes (folded into the redesign).
### 2026-10-19 - One URL form: no trailing slash
**Decided:** Canonical URLs have no trailing slash (/rsvp-reader). astro.config `trailingSlash: 'never'`, vercel.json `trailingSlash: false` (308s /x/ to /x), Layout derives canonical from the slash-stripped path, llms.txt and blog URLs updated.
**Why:** Both /x and /x/ returned 200, canonicals and sitemap said /x/, but ~130 internal links pointed to /x. Picking /x matched every internal link (smallest diff). Rejected /x/: it matched what Google had seen as canonical but needed every internal link rewritten or a redirect hop on each click. The site is ~2 months old, so re-canonicalization cost is small.
**Consequence:** Never link to /x/ forms. New pages get the right canonical automatically. Expect Search Console to show "Page with redirect" for old /x/ URLs for a few weeks; that is normal.

### 2026-10-19 - www and security headers live in vercel.json
**Decided:** www.briskread.com 308s to the apex via a host-matched redirect in vercel.json. Security headers moved from public/_headers (a Cloudflare Pages file Vercel ignores) into vercel.json; _headers deleted.
**Why:** www served a full duplicate site; the security headers were never applied on Vercel.
**Consequence:** Cloudflare leftovers (wrangler.toml, wrangler devDependency, README deploy notes) are dead but untouched.

### 2026-10-19 - robots.txt: one group, /account crawlable
**Decided:** Single `User-agent: *` group with `Disallow: /api/`. /account is no longer disallowed.
**Why:** The old /account Disallow sat under the cohere-ai group, so it applied to no other crawler. And /account carries noindex, which Google can only see if allowed to fetch it. AI crawlers all match `*`, so the per-bot groups were redundant.
**Consequence:** Keep private pages out of search with `noindex` (Layout prop), not robots.txt.

### 2026-10-19 - Schema: site identity on homepage only; FAQ schema generated from visible FAQ
**Decided:** Organization/WebSite/SoftwareApplication JSON-LD renders only on `/`. Pages add their own via `<script slot="head">`. Homepage and /rsvp-reader FAQs render from one array that also builds FAQPage. Deleted the homepage WebApplication schema that still advertised a $9 offer.
**Why:** The $9 AggregateOffer survived the premium removal. Both FAQPage blocks had drifted from the visible FAQ (Google requires them to match). /rsvp-reader had FAQ schema with no visible FAQ.
**Consequence:** Never hand-write FAQ JSON-LD; add to the `faqs` array. noindex pages emit no canonical.

### 2026-10-19 - Blog runs on BlogPost layout + src/data/posts.ts
**Decided:** All posts use src/layouts/BlogPost.astro (BlogPosting + BreadcrumbList + optional FAQPage, byline with dates, related posts). src/data/posts.ts is the single registry for titles, descriptions and dates; blog index and sitemap lastmod read it. Author is the Organization for now.
**Why:** Each post hand-rolled its schema, so fields and dates drifted. og:type was "website" on posts.
**Consequence:** A new post = one posts.ts entry + one page using BlogPost. Bump `dateModified` in posts.ts when visible copy changes; the sitemap uses it.

### 2026-10-19 - Sitemap: real lastmod only, no changefreq/priority
**Decided:** Only blog posts carry lastmod (from posts.ts). Dropped build-time lastmod on every URL, and changefreq/priority.
**Why:** A lastmod equal to build time on every page is ignored by Google; changefreq/priority are ignored outright.
**Consequence:** Tool pages have no lastmod until there is a real date source.

### 2026-10-19 - Query ownership and title rewrites
**Decided:** `/` owns "free online speed reader" (title + H1 kicker). /blog/free-online-speed-reader is refocused on "no signup". Bionic queries: see the merge entry above. Titles trimmed to 45-60 chars, em dashes removed.
**Why:** Home, a blog post and two bionic pages were competing for the same queries.
**Consequence:** New pages should target a query no existing page owns (see the map in this entry's audit, 2026-10-19 session).

### 2026-10-19 - Claims softened to match the site's own research stance
**Decided:** Removed or hedged unsupported claims: "1000+ WPM" (now 100-1,000), "eliminates sub-vocalization", bionic "faster fixation", the Audio Sync "beats flash-only" thesis, dated competitor limits. Added a sourced "average reading speed" answer (Brysbaert 2019) to /reading-speed-test.
**Why:** /reading-speed-test already says 1,000+ WPM claims "do not survive testing"; other pages contradicted it. Trust signals matter for E-E-A-T.
**Consequence:** Keep new copy consistent with the research the site cites.
