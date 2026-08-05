# Dodo Payments setup for BriskRead

BriskRead already implements checkout in code. You only configure the **Dodo dashboard** and paste secrets into **Vercel**.

## Status (test mode) — configured 2026-08-04

| Item | Value / status |
|------|----------------|
| Product | `BriskRead Lifetime Premium` — `$9` USD one-time |
| Product ID | `pdt_0NkgMQc4flFN3rPgAFkEn` |
| Webhook URL | `https://briskread.com/api/webhook` (`payment.succeeded`) |
| Webhook ID | `ep_3HSovbulAArSbPh07Vm9vx8GuRX` |
| Vercel Production | `DODO_API_KEY`, `DODO_PRODUCT_ID`, `DODO_MODE=test`, `DODO_WEBHOOK_SECRET` set + redeployed |

**Still on you before real money:** switch Dodo + Vercel to **live** keys/product/webhook when ready. Rotate the API key if it was shared in chat.

### Test-mode payment notes (India)

Billing country **IN** converts the $9 product to **INR + GST** and shows Card + UPI.

| Method | What to enter | Notes |
|--------|----------------|-------|
| Card (India) | `4576 2389 1277 1450`, exp `06/32`, CVC `123` | Or MC `5409 1626 6938 1034` |
| Card (US path) | `4242 4242 4242 4242`, exp `06/32`, CVC `123` | Set billing country US / Pay in USD |
| UPI | VPA `success@upi` (fail: `failure@upi`) | Prefer **UPI collect** with VPA, not a real UPI app |

**Pay now stays grey** until card number + expiry + CVC + cardholder name are all filled.

If Pay now runs but the payment stays `processing` with `error_message: "api Request Failed"`, that is a **Dodo/processor** failure (account or sandbox), not missing Vercel env. Check Dodo dashboard → Payments, complete business verification, or email support@dodopayments.com with the `pay_…` id.

## How money flows (already built)

```
User signs in (Supabase)
  → POST /api/create-checkout  (Bearer access_token)
  → Dodo hosted checkout_url
  → User pays
  → A) return to /?checkout=return&payment_id=… → GET /api/verify-payment
     B) Dodo webhook POST /api/webhook  (payment.succeeded)
  → Supabase entitlements.status = active for that user
```

Env vars the code expects:

| Variable | Purpose |
|----------|---------|
| `DODO_API_KEY` | Bearer token for test or live API |
| `DODO_PRODUCT_ID` | One-time product id (e.g. `pdt_…`) |
| `DODO_MODE` | `test` or `live` (selects API host) |
| `DODO_WEBHOOK_SECRET` | `whsec_…` signing secret for Standard Webhooks |

API hosts:

- Test: `https://test.dodopayments.com`
- Live: `https://live.dodopayments.com`

Official guide: https://docs.dodopayments.com/developer-resources/integration-guide

---

## Part A — Dodo dashboard (you do this in the browser)

### 1. Account

1. Open https://app.dodopayments.com/ (or the test dashboard if Dodo separates modes).
2. Finish merchant / business onboarding if prompted.
3. Stay in **Test mode** until a full purchase works.

### 2. Create Lifetime product

1. Go to **Products** → **Create product**.
2. Type: **One-time** (not subscription).
3. Name: `BriskRead Lifetime Premium` (or similar).
4. Price: **$9** USD (or your currency).
5. Description: one-time access, ad-free, unlimited length, multi-device account Premium.
6. Save and **copy Product ID** (`pdt_…` or similar).

### 3. API key

1. **Developer → API** (or Settings → API keys).
2. Create / copy the **Test** API key first.
3. You will paste this as `DODO_API_KEY` on Vercel.

### 4. Webhook

1. **Developer → Webhooks** → **Add endpoint**.
2. URL (exact):

   ```text
   https://briskread.com/api/webhook
   ```

3. Events: at least **`payment.succeeded`** (our handler only fulfills on that; others are ignored with 200).
4. Save and copy the **Webhook signing secret** (`whsec_…`).
5. That is `DODO_WEBHOOK_SECRET`.

Do **not** use a `*.vercel.app` URL for the webhook if you always sell on the custom domain; use production `briskread.com`.

### 5. Return URL

Already set in code:

```text
https://briskread.com/?checkout=return
```

Dodo will append `payment_id` (and related query params) after payment.

---

## Part B — Vercel environment variables

In Vercel → Project **speedread** → Settings → Environment Variables → **Production**:

| Name | Example | Notes |
|------|---------|--------|
| `DODO_API_KEY` | `dodo_…` | Test key first |
| `DODO_PRODUCT_ID` | `pdt_…` | Lifetime product |
| `DODO_MODE` | `test` | Use `live` only with live key + live product |
| `DODO_WEBHOOK_SECRET` | `whsec_…` | From webhook endpoint |

Already present (required for checkout + entitlements):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

**Redeploy Production** after saving env vars (Deployments → Redeploy). Env changes do not apply to the old deployment.

### CLI (after you have the four values)

```bash
# From the repo root (logged into vercel CLI)
echo "YOUR_TEST_API_KEY" | npx vercel env add DODO_API_KEY production
echo "YOUR_PRODUCT_ID" | npx vercel env add DODO_PRODUCT_ID production
echo "test" | npx vercel env add DODO_MODE production
echo "whsec_YOUR_SECRET" | npx vercel env add DODO_WEBHOOK_SECRET production
npm run deploy
```

Or paste all four secrets in chat (or only in Vercel UI) and ask the agent to run the CLI.

---

## Part C — End-to-end test (Test mode)

1. Open https://briskread.com/account → **create / sign in**.
2. Go to https://briskread.com/#pricing.
3. Click **Get Lifetime Pro**.
4. You should leave BriskRead and land on Dodo checkout (test cards if Dodo provides them).
5. Complete payment.
6. You return to `/?checkout=return&payment_id=…`.
7. Alert: Premium attached to account **or** Premium UI updates.
8. Refresh; account plan should show Lifetime / Premium.
9. In Dodo dashboard: payment succeeded + webhook delivery **2xx** to `/api/webhook`.

If checkout button says “Checkout is not configured yet” → missing `DODO_API_KEY` or `DODO_PRODUCT_ID` or no redeploy.

If payment works but Premium never unlocks:

- Check Vercel function logs for `/api/webhook` and `/api/verify-payment`.
- Confirm metadata `briskread_user_id` is present (user must be signed in before checkout).
- Confirm webhook secret matches the endpoint you created.

---

## Part D — Go live

1. Create **Live** product (or promote) and note **live** product id.
2. Create **Live** API key.
3. Webhook endpoint for live (same URL is fine if Dodo separates secrets per mode — use the secret for the mode you’re in).
4. Set on Vercel:
   - `DODO_MODE=live`
   - Live `DODO_API_KEY`
   - Live `DODO_PRODUCT_ID` if different
   - Live `DODO_WEBHOOK_SECRET` if different
5. Redeploy.
6. Real card smoke test with a small refund path ready.

---

## Note on license-key panel

Homepage still has a “paste license key / activate device” UI that calls `/api/activate-license`. That route is **not** in the current `api/` folder. **Primary Premium path is account-linked** via Supabase `entitlements` after Dodo pay. Device license activation is legacy/incomplete unless you re-add that endpoint later. For launch, use:

**Sign in → Buy → account Premium.**

---

## Checklist

- [ ] Dodo account + Test mode
- [ ] One-time product $9 → Product ID
- [ ] Test API key
- [ ] Webhook `https://briskread.com/api/webhook` + `payment.succeeded` + secret
- [ ] Four env vars on Vercel Production
- [ ] Redeploy
- [ ] Signed-in test purchase
- [ ] Webhook 200 in Dodo logs
- [ ] Account shows Premium
- [ ] Switch to live when ready
