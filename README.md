# BriskRead

Free online **speed reader** — RSVP flash reading, bionic text, PDF/EPUB upload, image OCR, synced TTS, and optional Gemini AI. Built as an Astro micro-tool for Cloudflare Pages + AdSense.

**Live target:** [https://briskread.com](https://briskread.com)

## Stack

- Astro 7 (static MPA) + Cloudflare Pages Functions
- Client-side: pdf.js, JSZip, Tesseract (CDN, on demand)
- Payments: Dodo Payments → multi-device **license key**
- Ads: Google AdSense (Auto Ads + optional units)

## Develop

```bash
npm install
npm run dev
```

```bash
npm run build
npm run deploy   # wrangler pages deploy dist
```

Copy `.env.example` for public vars. Set Cloudflare secrets for Dodo / JWT / Gemini. Full go-live steps: **[LAUNCH.md](./LAUNCH.md)**.

## Monetization (current)

All features are free; the site is supported by AdSense. The old $9 Lifetime Premium /
license-key / device-session system was removed (checkout APIs, license activation, and
founding-seat grants deleted). Sign-in (Supabase) now exists only for cross-device sync
of library/queue/stats.

## Chrome extension

Load `chrome-extension/` unpacked (see `chrome-extension/README.md`).

- **Everything unlocked** — in-page reading, Flash/Focus modes, AI summaries, read-later
- **Speed read this page** extracts article text and opens the web app with session handoff

## Project map

| Path | Role |
|------|------|
| `src/pages/index.astro` | Main tool |
| `src/pages/rsvp-reader.astro` etc. | SEO satellite pages |
| `src/components/AdSlot.astro` | AdSense units |
| `functions/api/*` | extract, checkout, license, gemini |
| `chrome-extension/` | BriskRead Sync |
