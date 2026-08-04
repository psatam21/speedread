# Launch next steps (human dashboards)

## Vercel env (current state)

Already set on Production (verified via CLI):

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_MODEL`
- `CRON_SECRET`

**You still need to add** (Dashboard → Project → Settings → Environment Variables → Production):

| Variable | Where to get it |
|----------|-----------------|
| `DODO_API_KEY` | Dodo Payments dashboard |
| `DODO_PRODUCT_ID` | Lifetime Premium product id |
| `DODO_MODE` | `test` then `live` |
| `DODO_WEBHOOK_SECRET` | Webhook signing secret |
| `JWT_SECRET` | Long random string (license/device tokens) |
| `PUBLIC_GA_MEASUREMENT_ID` | GA4 → Admin → Data stream → Measurement ID (`G-…`) |
| `PUBLIC_ADSENSE_CLIENT_ID` | AdSense (`ca-pub-…`) after approval |
| `PUBLIC_ADSENSE_AUTO_ADS` | `true` (optional) |
| Slot ids | Only if not using Auto Ads only |

After adding secrets, redeploy Production.

Webhook URL for Dodo: `https://briskread.com/api/webhook`

## Google Search Console

**DNS is on Vercel** (Namecheap NS → Vercel). TXT verification must be added in Vercel, not Namecheap.

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property → **URL prefix** → `https://briskread.com`
3. Choose **Domain** property or URL-prefix; for Domain use DNS TXT
4. Copy the full string Google shows, e.g. `google-site-verification=AbCdEf…`
5. Add TXT at apex via CLI (already logged in as your Vercel user):

```bash
npx vercel dns add briskread.com '@' TXT "google-site-verification=PASTE_THE_FULL_VALUE_HERE"
```

Or Vercel Dashboard → Project/Team **Domains** → briskread.com → DNS → Add TXT, Name `@`, Value = full verification string.

6. Wait 1–5 minutes, click **Verify** in Search Console  
7. Sitemaps → submit **both** (if one fails, try the other):
   - `https://briskread.com/sitemap-0.xml`  ← submit this first if index fails
   - `https://briskread.com/sitemap-index.xml`
   - also works: `https://briskread.com/sitemap.xml` (redirects to the index)
8. “**Couldn't fetch**” is often temporary right after verification. Confirm the URL opens in an incognito browser (should download/show XML). Wait a few hours and **Resubmit**. Also use **URL Inspection** on `https://briskread.com/` → Request indexing.
9. Request indexing for `/`, `/blog`, `/rsvp-reader`, `/bionic-reading`, `/pdf-to-speech`, `/extension`

**Note:** Do not paste the verification string into chat if you prefer privacy — run the `vercel dns add` command yourself with the value from Google.

## Google Analytics 4

1. Create GA4 property + web data stream for `briskread.com`
2. Copy Measurement ID → `PUBLIC_GA_MEASUREMENT_ID` on Vercel
3. Redeploy; confirm events in GA4 Realtime

## Chrome extension (developer mode)

**Preferred for daily testing:** Load unpacked folder (not zip).

1. Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select folder:  
   `Side projects/Speedread/chrome-extension`
4. Pin the extension; open Options if you need local API origin

**Zip for archive / Web Store later:**  
`release/briskread-extension-v1.6.0.zip` (from `npm run ext:pack`)

Note: Chrome “Load unpacked” wants a **folder**. Zip is for Store upload or sharing; unpack it first if you only have the zip.

## What “pending #6” meant

**Chrome extension as a product surface** — package, sideload, eventually Chrome Web Store listing, and make “read this page” a daily habit. Not a mysterious backend task.
