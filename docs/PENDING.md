# What’s pending (ops + growth)

Updated after Supabase CLI fix + SEO/AEO pass.

## Must do (you / external)

| Item | Status | Action |
|------|--------|--------|
| **Dodo identity + business verification** | Pending review (forms submitted) | Wait for **Approved** in Dodo dashboard; chase support if &gt;48h with business id `bus_0NjKgYXPkGfAMqp8QhjKN` |
| **Dodo live mode** | Blocked until verification + live key | After approval: live API key, live product, live webhook `https://briskread.com/api/webhook`, set Vercel `DODO_MODE=live` + secrets, redeploy |
| **Dodo test charges** | Still fail (`api Request Failed`) | Optional: email Dodo with `pay_0NkgRdiBiZHvFe4IA92me` / UPI payment ids; not required to go live if verification passes |
| **ImprovMX domain “pending”** | Public MX/SPF already correct | ImprovMX UI → recheck DNS; create aliases (`support@`, `privacy@`, catch-all); wait propagation |
| **Google Search Console** | Human | Verify property, submit `sitemap-0.xml`, request indexing for new blog URLs |
| **Bing Webmaster** | Human | Import from GSC or submit sitemap (helps Copilot / some AI surfaces) |
| **Brand social profiles** | Empty `sameAs` | Create X/LinkedIn/Product Hunt pages → add URLs to Organization schema `sameAs` |
| **Chrome Web Store listing** | Optional | Publish extension when ready |

## Done recently (code / CLI)

- Supabase Site URL + redirect allow list → `https://briskread.com`
- Signup `emailRedirectTo` → `/account`
- Dodo test product, webhook, Vercel env (test mode)
- Logo / favicon / OG
- Focus full-width + fixed centre line + hero match
- SEO/AEO: `llms.txt`, robots AI agents, SoftwareApplication schema, 2 new comparison guides, TL;DRs, FAQ schema on RSVP

## Founding Lifetime (automatic, no UI claim)

| Item | Detail |
|------|--------|
| Cap | **50** seats (`source = 'founding'`, `status = 'active'`) |
| How | DB function `try_grant_founding_lifetime` on signup trigger + `claim_founding_seat` / `POST /api/ensure-founding` on login |
| Migration | `supabase/migrations/20260805120000_founding_lifetime_auto.sql` — **must be applied** to production |
| After 50 | New accounts get inactive entitlement; Premium only via Dodo $9 |

Check remaining seats:

```sql
select 50 - count(*) as remaining
from public.entitlements
where source = 'founding' and status = 'active';
```

## Growth backlog (not blocking launch)

- Reddit: free core + early access story (not “everything free forever”)
- 2–4 Reddit-native posts/comments per month in relevant subs (value-first, not spam)
- Product Hunt / Indie Hackers launch when payments are live
- One original data post (e.g. WPM test aggregate stats) for citations
- Backlinks: guest notes, tool directories (AlternativeTo, SaaSHub, There’s An AI For That if applicable)
