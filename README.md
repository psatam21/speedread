# SpeedRead

Free online **speed reader** — RSVP flash reading, bionic text, PDF/EPUB upload, image OCR, synced TTS, and optional Gemini AI. Built as an Astro micro-tool for Cloudflare Pages + AdSense.

**Live target:** [https://speedread-web.com](https://speedread-web.com)

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

## Premium (multi-device, anti-share)

1. Buy Lifetime Pro ($9) → signed **license key** + Cloudflare **KV** device roster.
2. Each browser gets a **device session** (max **5** devices). APIs require the session, not the raw key.
3. At limit: revoke a device from the Premium panel, then activate again.
4. Bind KV `LICENSES` on Cloudflare Pages (required). See `LAUNCH.md`.

## Chrome extension

Load `chrome-extension/` unpacked (see `chrome-extension/README.md`).

- **Premium sign-in** with the same lifetime license key (1 of 5 device slots)
- **Speed read this page** extracts article text and opens the web app with session handoff
- Sign out revokes the extension device slot

## Project map

| Path | Role |
|------|------|
| `src/pages/index.astro` | Main tool |
| `src/pages/rsvp-reader.astro` etc. | SEO satellite pages |
| `src/components/AdSlot.astro` | AdSense units |
| `functions/api/*` | extract, checkout, license, gemini |
| `chrome-extension/` | SpeedRead Sync |
