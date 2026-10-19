# BriskRead extension: audit and gap analysis (2026-10-19)

Version audited: 1.6.0 (sideload only). Version shipped: 2.0.0.

## 1. Audit findings and what changed

| # | Finding in 1.6.0 | Risk | Fixed in 2.0.0 |
| --- | --- | --- | --- |
| 1 | Host permission for `generativelanguage.googleapis.com` | An extra install warning and review scrutiny. Not needed: the Gemini API allows browser calls (tested) | Removed |
| 2 | Content script and host permission on briskread.com (web-app handoff) | Install warning "Read and change your data on briskread.com", for a minor feature | Removed. Saved links open on briskread.com via `?url=` instead. **2.0.0 installs with no permission warnings.** |
| 3 | Optional localhost host permissions and a developer-endpoint form | Dev-only surface shipped to users | Removed |
| 4 | Leftover premium/licence code (device IDs, licence keys, a pricing URL, README) | Dead code; misleading to reviewers | Removed |
| 5 | "Speed read linked page" read the *current* page with the link pasted on top | Wrong result | Opens briskread.com/?url=… so the site extracts the real page |
| 6 | PDFs in Chrome's viewer showed "No readable text" | Broken on a common use case | PDF bytes read inside the tab, text extracted with bundled pdf.js |
| 7 | chrome:// and Web Store pages opened an empty reader window | Looked broken | Reader tab explains why and offers paste / open file |
| 8 | Gemini key sent as `?key=` in the URL | Keys in URLs leak into logs | Sent as the `x-goog-api-key` header |
| 9 | Read-later stored up to 400k chars × 50 items | Could exceed the 10 MB storage quota, so saves failed silently | Text capped at 180k chars per item; oldest items dropped on quota errors; duplicates collapse |
| 10 | Typing in the overlay's AI box reached the host page's own shortcuts | GitHub/YouTube shortcuts fired while typing | Key events stopped at the shadow host |
| 11 | No dialog role, no focus management | Accessibility gap | role=dialog, aria-modal, focus moved in and restored, Tab trapped |
| 12 | Overlay used z-index only | Page modals or transforms could cover it | Rendered in the top layer (popover) |
| 13 | Click listener re-added on every mode switch; a second open ignored a new selection | Minor bugs | Fixed |
| 14 | Icons were a generic bolt, not the brand mark; a 600 KB unused `icon.png` | Brand mismatch, repo weight | Icons from `public/images/brand-mark.png`; 128px follows store padding rules |
| 15 | Fallback reader was a separate, weaker RSVP-only page | Two UIs to maintain | One reader UI for in-page and the reader tab |
| 16 | The handoff script retried 8 times on *every* briskread.com visit | Wasted work | Removed with #2 |
| 17 | Privacy page section 1b is out of date | Store review compares it to the disclosures | Rewritten in `src/pages/privacy.astro`, with the Limited Use statement; live after the next deploy |

## 2. Permissions (final)

| Permission | Why | Install warning |
| --- | --- | --- |
| activeTab | Read the current tab only after a user gesture | None |
| scripting | Inject the reader, extract text, apply bionic, read PDF bytes | None (no host permissions) |
| storage | Settings, read-later queue, reading positions, optional Gemini key | None |
| contextMenus | Right-click options | None |

No host permissions, content scripts or web-accessible resources. CSP: `script-src 'self'; object-src 'self'`. No remote code. pdf.js 3.11.174 is bundled unmodified (Apache-2.0).

## 3. Behaviour on hard pages

| Page | Behaviour |
| --- | --- |
| Normal article | Reader opens in place (tested) |
| Text selected | Reads only the selection; iframe selections keep paragraph breaks (tested) |
| SPA after client-side navigation | Reads the current view (tested) |
| Strict CSP (`default-src 'none'`) | Full styled reader; styles use adopted stylesheets (tested) |
| PDF in Chrome's viewer | Reader tab with the PDF's text (tested) |
| Scanned PDF | Message pointing to briskread.com OCR |
| chrome://, Web Store, other browser pages | Reader tab explains and offers paste/open file (tested) |
| file:// pages | Message about "Allow access to file URLs" |
| Google Docs (canvas) | "No readable text"; selecting text and right-clicking works |
| Iframes | Selection reading works per frame; whole-page extraction reads the top frame |

## 4. Competitive gap analysis

| Competitor | What users pay for or miss | BriskRead 2.0 |
| --- | --- | --- |
| SwiftRead (formerly Spreed) | PDF/ePub and read-aloud historically in Pro; one user review cites $15/month (unverified) | PDFs and read-aloud free |
| Bionic Reading (official) | Subscription; free "Discover" tier is limited | Bionic on the live page, free |
| Speechify | Free tier reportedly capped at 1.5x speed with basic voices; Premium about $29/month (third-party figures) | Read-aloud with highlighting at any speed, using the browser's natural voices |
| Helperbird | Natural voices with word highlighting are Pro (~$30/year, figures vary on its own pages) | Free |
| Read Aloud | Strong free TTS but no speed-reading modes | Six reading modes plus audio |

**Built:** read-aloud with synced highlighting (with a stall watchdog and silent fallback), page bionic that follows new content and restores exactly, PDF reading, selection-aware shortcut, resume position, slow-start ramp, themes and text size, a welcome page with demo, and a paste/open-file reader.

**Deliberately not built:** OCR, ePub/Kindle, dyslexia fonts, stats, and account sync. Each adds weight and review surface without being a reason people switch. OCR already exists on briskread.com.

## 5. Known limitations

- Read-aloud quality depends on the voices installed in the browser. Edge and Chrome on Windows/Mac have good natural voices; some Linux setups have none (the reader says so).
- Chrome needs a click inside the page before it will speak. If audio is on and the reader was opened by a shortcut, it shows "Press Play to start audio".
- PDF text order follows the PDF's internal order. Multi-column papers can interleave columns.
- Whole-page extraction is heuristic. Selecting text first always works.

## Sources

- https://developer.chrome.com/docs/webstore/images
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/program-policies/limited-use
- https://developer.chrome.com/docs/webstore/register
- https://developer.chrome.com/docs/webstore/best-practices
- https://chromewebstore.google.com/detail/ipikiaejjblmdopojhpejjmbedhlibno (SwiftRead)
- https://michigan.it.umich.edu/news/2022/08/30/tech-tip-swiftread
- https://alternativeto.net/software/bionic-reading/about
- https://www.costbench.com/software/ai-voice-tools/speechify/free-plan/
- https://helperbird.com/pricing/
- https://www.helperbird.com/help/what-is-helperbird-pro
