# Manual QA checklist (about 25 minutes)

Automated coverage (`npm run ext:test`, 20 tests) runs the packaged build in Chromium. One test runs the exact release folder with no extra permissions and uses Chrome's own toolbar-click path to grant activeTab, then reads, bionic-toggles, saves, reads a selection and opens a PDF. What automation still can't do: press the real keyboard shortcuts, use the right-click menu, or play audio through speakers. This list covers those.

**Setup:** unzip `release/briskread-extension-v2.0.0.zip` to a folder. In `chrome://extensions`, turn on Developer mode, then **Load unpacked** that folder. Remove any older BriskRead first. Use a normal (non-test) Chrome profile.

## 1. Install and first run
- [ ] The welcome tab opens on install and shows Alt+Shift+S, Alt+Shift+K and Alt+Shift+L.
- [ ] "Try a 30-second demo" opens the reader and plays.
- [ ] `chrome://extensions` shows **no** "Read and change your data" warning in the extension's details.
- [ ] Pin the icon. The popup opens and the theme matches your system's light/dark setting.

## 2. Real shortcuts and gestures (the activeTab path)
On a long article (Wikipedia, a Substack post, a news site):
- [ ] **Alt+Shift+S** opens the reader over the page. It starts playing after half a second.
- [ ] Select one paragraph, then press Alt+Shift+S. Only that paragraph is read.
- [ ] Right-click, then **Speed read this page**, **Speed read selection** and **Bionic reading on this page** each work.
- [ ] Toolbar popup: **Speed read this page**, **Bionic page** and **Read later** each work.
- [ ] **Alt+Shift+K** turns bionic on, and again turns it off. The page looks exactly as before.
- [ ] **Alt+Shift+L** flashes a number on the icon. The page appears in the popup queue.
- [ ] Right-click a link, then **Speed read linked page**. briskread.com opens with that article.
- [ ] Right-click a link, then **Save to read later**. It saves as "Link", and **Read** opens it on briskread.com.

## 3. Reader controls
- [ ] Space plays and pauses. ←/→ skip 10 words (Shift for 50). ↑/↓ change speed by 25. 1 to 6 switch modes. Esc closes.
- [ ] Tab cycles focus inside the reader only. Focus returns to the page after closing.
- [ ] The page underneath doesn't scroll while the reader is open, and scrolls normally after closing.
- [ ] On GitHub or YouTube: type in the AI box and confirm the site's own shortcuts (`/`, `k`, `t`) don't fire.
- [ ] Settings: Dark, Light and Sepia themes and the three text sizes apply instantly. Close and reopen, and they stick.
- [ ] Close mid-article and reopen the same page: "Resumed at N%" appears. **Start over** goes to the beginning.

## 4. Read aloud (needs real speakers)
- [ ] Press **Listen** (or A), then Play. The voice reads and the highlight follows it, in Focus and in Flash.
- [ ] Change speed while it plays. Speech restarts at the new rate from the current word.
- [ ] Pick a different voice in Settings. It is used on the next play.
- [ ] Optional, in Edge: the "Online (Natural)" voices are listed first.
- [ ] Turn off Wi-Fi mid-read with a Google voice. Within about 5 seconds it falls back to a local voice or keeps reading silently. It never freezes.

## 5. PDFs and blocked pages
- [ ] Open an online PDF (for example any arxiv.org PDF). Alt+Shift+S opens a reader tab with the paper's text.
- [ ] A scanned (image-only) PDF shows the "no text layer" message pointing to briskread.com/pdf-to-speech.
- [ ] Popup, then **Open a PDF or paste text**, then open a local PDF. It reads.
- [ ] Drag a PDF onto the reader tab. It reads.
- [ ] On `chrome://settings` and on the Chrome Web Store, Alt+Shift+S opens a reader tab that explains why and offers the paste box.
- [ ] Open a local `file:///` HTML page. Alt+Shift+S shows the "Allow access to file URLs" message, and works once that toggle is on.

## 6. Hard pages
- [ ] Single-page app: navigate inside the site (Gmail, X, YouTube), then read. It picks up the current view.
- [ ] Infinite scroll with bionic on (X, Reddit): new posts get bolded as they load.
- [ ] Google Docs: expect "No readable text here" (Docs draws on canvas). Selecting text and right-clicking **Speed read selection** works.
- [ ] Gmail: select an email body, then Alt+Shift+S. Only the email is read.

## 7. AI (optional, needs a free key from aistudio.google.com)
- [ ] Without a key: Summarise shows "Add your free Gemini API key" with an Options button.
- [ ] With a key saved in Options: Summarise returns bullet points. Ask answers from the text.
- [ ] A wrong key shows Google's error message, not a blank panel.

## 8. Data and uninstall
- [ ] Options: **Clear read-later queue and reading positions** empties the popup queue.
- [ ] Remove the extension and reinstall it. Settings and the queue are gone, and the welcome page shows again.

## 9. Mac (if available)
- [ ] The shortcuts are Option+Shift+S/K/L and show correctly in the popup and Options.
