# SpeedRead Chrome Extension (production)

**Version:** see `manifest.json`  
**Store-ready package:** `npm run ext:pack` → `release/speedread-extension-v*.zip`

## Features

- Premium license sign-in (same `/api/activate-license` + 5 device slots)
- Local RSVP popup for selected text or the active page
- Single-word and three-word phrase display modes
- Context menu: **Speed read this page**
- Keyboard: **Alt+Shift+S**
- Explicit web-app button for the full workspace
- Options page (API/app origin for local dev only)
- Sign out unbinds this extension device

## Install (developer / sideload)

1. `npm run ext:icons` (once)
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked**
3. Select this `chrome-extension/` folder

## Package for Chrome Web Store

```bash
npm run ext:pack
```

Upload `release/speedread-extension-vX.Y.Z.zip` in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).

### Store listing checklist

| Field | Value |
|--------|--------|
| Name | SpeedRead — Speed Reader for Chrome |
| Summary | Speed-read any webpage; optional Lifetime Premium login |
| Category | Productivity |
| Language | English |
| Homepage | https://speedread-web.com/extension |
| Privacy policy | https://speedread-web.com/privacy |
| Single purpose | Speed-read web pages with optional paid license |
| Permissions justification | activeTab/scripting: extract on user action; storage: license; contextMenus: shortcut; host speedread-web.com: activate + open reader |

Screenshots: capture extension popup, local RSVP reader and Options explanation.

## Production requirements

1. Site deployed at `https://speedread-web.com` with Pages Functions
2. KV binding `LICENSES` + `JWT_SECRET` + Dodo env for purchases
3. Content script matches only production origin (see `manifest.json`)

## Local API testing

Options → set API base / app origin to localhost. You may need **optional host permissions** granted and a temporary content_scripts match for localhost (dev fork of manifest).

## Privacy

- No continuous browsing capture
- Extract only on explicit user action
- License keys stored in `chrome.storage.local` on device
