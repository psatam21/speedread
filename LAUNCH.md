# SpeedRead — Micro-Tool Launch Checklist

Target stack: **Astro + Cloudflare Pages + AdSense + $9 lifetime Premium**.  
Infrastructure goal: **$0/month**. Domain: **speedread-web.com**.

---

## Done in code

- [x] Core tool (RSVP / Bionic / Standard + TTS)
- [x] Compliance pages: Privacy, Terms, About, Contact (MPA)
- [x] SEO satellite pages: `/rsvp-reader`, `/bionic-reading`, `/pdf-to-speech`
- [x] FAQ + FAQPage JSON-LD + WebApplication schema
- [x] `robots.txt` + `@astrojs/sitemap` + `site` in `astro.config.mjs`
- [x] `_headers` noindex on `*.pages.dev` (duplicate-content fix)
- [x] Favicon present
- [x] AdSense script hooks + `AdSlot` units + `ads.txt` template
- [x] Multi-device premium via signed **license key** (paste on any device)
- [x] Pages Functions: extract, checkout, verify-payment, activate-license, gemini, webhook
- [x] `?url=` auto-extract for bookmarklet / Chrome extension
- [x] Custom 404
- [x] `.env.example` + deploy script

---

## You must do (human / dashboards)

### 1. Env & deploy

1. Copy `.env.example` → set public vars for local preview if needed.
2. Cloudflare Pages project → **Settings → Environment variables**:
   - `PUBLIC_GA_MEASUREMENT_ID`
   - `PUBLIC_ADSENSE_CLIENT_ID` (after AdSense approval; optional earlier)
   - `PUBLIC_ADSENSE_SLOT_TOP` / `_MID` / `_BOTTOM` (optional; Auto Ads is enough at first)
   - `PUBLIC_ADSENSE_AUTO_ADS=true`
   - Secrets: `DODO_API_KEY`, `DODO_PRODUCT_ID`, `DODO_MODE`, `DODO_WEBHOOK_SECRET`, `JWT_SECRET`, `GEMINI_API_KEY`
3. **KV binding (required for Premium device limits):**
   - `npx wrangler kv namespace create LICENSES`
   - Dashboard → Pages project → Settings → Functions → KV namespace bindings → `LICENSES`
   - Or set `id` under `[[kv_namespaces]]` in `wrangler.toml`
3. `npm run build` then `npm run deploy` (or CF Git integration).
4. Custom domain `speedread-web.com` + `www` on the Pages project.
5. Confirm: `curl -I https://<project>.pages.dev` has `x-robots-tag: noindex`.

### 2. Payments (Dodo)

1. Create product **SpeedRead Lifetime Premium — $9**.
2. Set return URL to production origin (checkout uses origin automatically).
3. Webhook → `https://speedread-web.com/api/webhook` with `DODO_WEBHOOK_SECRET`.
4. Test mode first: buy → return → license key shown → activate on second browser.

### 3. Analytics & Search

1. GA4 property → measurement ID → env.
2. Google Search Console → URL prefix → DNS TXT verify → submit `sitemap-index.xml`.
3. Bing Webmaster → import from GSC.
4. Request indexing on `/`, `/rsvp-reader`, `/bionic-reading`, `/pdf-to-speech`.

### 4. AdSense (after ~1 month + real traffic)

1. Apply only when domain is live ≥ 1 month and ~10+ daily users.
2. Paste ads.txt from AdSense dashboard into `public/ads.txt` (replace `pub-XXXXXXXX…`).
3. Set `PUBLIC_ADSENSE_CLIENT_ID=ca-pub-…`.
4. Prefer **Auto Ads** first; add manual slots later.
5. First rejection for “low value content” is common — expand FAQs, re-apply.

### 5. Distribution

1. Chrome extension: `npm run ext:pack` → upload zip to Web Store; sideload via Load unpacked for QA.
2. Install docs: https://speedread-web.com/extension
3. Share bookmarklet + homepage on Reddit/LinkedIn for first index signals.
4. Internal links: satellite pages ↔ home (already wired).

---

## Multi-device premium (how it works — anti-share)

1. User pays via Dodo → `/api/verify-payment?payment_id=&device_id=&device_label=`.
2. Server confirms payment, issues HMAC **license key**, writes Cloudflare **KV** `LICENSES` row.
3. This browser is bound as a **device slot** (max **5**). Client gets a **device session token** (not the raw license) for APIs.
4. Other device: paste key → `POST /api/activate-license` with new `device_id` → new slot if &lt; 5.
5. At 5 devices: activation returns `DEVICE_LIMIT` + list; user **Revokes** a device to free a slot.
6. Gemini proxy requires `typ: device` session + device still present in KV (revoked devices fail).

**Required:** bind KV namespace `LICENSES` on the Pages project (see `wrangler.toml`).

**What this stops:** unlimited key sharing / public paste of a working premium key for infinite devices.  
**What remains:** client-only ad hide / word cap can still be forged in DevTools (any pure-client tool); paid Gemini cost is server-gated.

---

## Primary keywords (track in GSC)

| Page | Primary intent |
|------|----------------|
| `/` | online speed reader, free speed reading tool |
| `/rsvp-reader` | RSVP reader online |
| `/bionic-reading` | bionic reading online |
| `/pdf-to-speech` | PDF to speech free, PDF speed reader |

US CPM traffic preferred. Measure rankings monthly; do not spam re-index.
