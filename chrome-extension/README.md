# BriskRead Chrome extension

Speed read any page in place: Flash/Focus/Phrase/Flow/Bionic/Page modes, read-aloud with a synced highlight, bionic reading on the live page, PDFs, a read-later queue with resume, and optional AI summaries with the user's own Gemini key. Manifest V3, no host permissions, no build step.

## Commands (repo root)

| Command | What it does |
| --- | --- |
| `npm run ext:test` | Unit checks plus the Playwright suite against the packaged build |
| `npm run ext:pack` | Validates and builds `release/briskread-extension-vX.Y.Z/` and the `.zip` to upload |
| `npm run ext:assets` | Store screenshots, promo tiles and icon into `release/store/` |
| `npm run ext:icons` | Regenerates `icons/` from `public/images/brand-mark.png` |

Load for development: `chrome://extensions`, then Developer mode, then **Load unpacked** this folder.

## Map

| File | Role |
| --- | --- |
| `background.js` | Service worker: shortcuts, context menus, text extraction, reader injection, read later, Gemini calls |
| `overlay.js` | The reader UI (shadow DOM, top layer). Injected into pages; also mounted by `reader.html` |
| `reader.html` / `reader-page.js` | Reader tab for PDFs, blocked pages, local files, pasted text and the welcome demo |
| `page-bionic.js` | Bionic formatting on the live page (toggle, follows new content, exact restore) |
| `popup.*`, `options.*` | Toolbar popup and the options/welcome page |
| `lib/ext-core.js` | Pure helpers (settings, pacing, speech mapping, URL rules), unit-tested in node |
| `lib/reader-core.js` | Verbatim copy of the site's `public/reader-core.js`; keep the two in sync |
| `lib/extract.js` | Article extraction, injected into the page |
| `lib/storage.js` | Settings, read-later and resume storage |
| `styles/tokens.css` | **All colours, radii and fonts** (Paper and Pen, mirrored from the site). Change the look here |
| `fonts/` | Hanken Grotesk and Newsreader (OFL) for the extension's own pages |
| `vendor/pdfjs/` | pdf.js 3.11.174, unmodified (Apache-2.0) |
| `store/` | Listing copy, publishing guide, QA checklist, audit (not shipped in the zip) |

## Privacy model

Page text is read only on a user gesture (activeTab) and processed in the browser. Settings, the queue and reading positions live in `chrome.storage.local`. The only network call is Gemini, made only when the user presses Summarise or Ask, with their own key, sent as a header.
