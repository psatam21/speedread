# Publishing BriskRead to the Chrome Web Store

Everything up to the Submit button is prepared. The steps marked **YOU** need your Google account, payment or a legal agreement, so only you can do them.

## Step 0. Before the dashboard (about 15 minutes)

1. Build and check, from the repo root:

   ```bash
   npm run ext:test
   ```

   ```bash
   npm run ext:pack
   ```

   ```bash
   npm run ext:assets
   ```

   You should see 20 passing tests, `release/briskread-extension-v2.0.0.zip`, and 8 images in `release/store/`.

2. Do the manual QA pass in `QA.md`. The toolbar-click permission path is automated, but real keyboard shortcuts, right-click menus and audio need a person.

3. **Deploy the privacy page.** Reviewers compare the Privacy tab to this page. The new section "1b. Chrome Extension" below is already in `src/pages/privacy.astro` (committed); it goes live with the next site deploy:

   > **1b. Chrome Extension.** The BriskRead Chrome extension reads the text of a page only when you ask it to, with a keyboard shortcut, the toolbar button or the right-click menu. It uses four permissions. activeTab and scripting let it read and display the page you are on. storage keeps your settings, read-later queue, reading positions and optional Gemini key on your device. contextMenus adds the right-click options. Page text is processed in your browser and is not sent to BriskRead. If you use AI summary or questions, the text is sent from your browser directly to Google's Gemini API using your own key. "Speed read linked page" opens briskread.com with that link, and our server fetches that public page for you. The extension has no analytics, no tracking and no ads. Uninstalling it deletes all of its data. BriskRead's use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

   The last sentence is required: Google's Limited Use policy asks for an affirmative statement like it on your site.

## Step 1. Create the developer account (**YOU**, one time, about 10 minutes)

1. Go to https://chrome.google.com/webstore/devconsole and sign in. Use the Google account that should own BriskRead long term. **The developer email can't be changed later.** A dedicated account (for example the one that owns briskread.com in Search Console) is the safest choice.
2. Accept the developer agreement and policies.
3. Pay the one-time registration fee. It has been US$5 since launch (likely; Google's page no longer states the amount, so check the number on screen).
4. Trader or non-trader declaration. This is your call:
   - Non-trader if this is a personal, non-commercial project.
   - Trader if BriskRead is run as a business. The site plans to earn from ads, so this probably applies (guessing; it's a legal question). Under EU rules, traders must show a contact address, email and phone on the listing.
5. Fill in the **Account** tab: publisher display name `BriskRead`, a contact email, and verify that email.

## Step 2. Upload the package (about 2 minutes)

1. Dashboard, then **Add new item**.
2. Upload `release/briskread-extension-v2.0.0.zip`.

## Step 3. Store listing tab (about 10 minutes)

Copy every field from `LISTING.md`: description, category, language, the 5 screenshots in order, both promo tiles, homepage and support URLs.

For **Official URL**, pick `briskread.com`. It only appears once the site is verified in Google Search Console with the same Google account. If it isn't listed, skip it. It's optional and you can add it later.

## Step 4. Privacy practices tab (about 5 minutes)

Paste from `LISTING.md`: single purpose, the four permission justifications, "No remote code", tick only **Website content**, tick the three certifications, and set the privacy policy URL. Only do this after Step 0.3 is live.

## Step 5. Distribution tab

Public, all regions, free.

## Step 6. Submit (**YOU**)

Press **Submit for review**. You can choose to publish automatically when approved, or hold it and publish by hand.

- Review usually takes a few days (likely). Extensions with no host permissions tend to go faster.
- If it's rejected, the email names the policy. Send it to me and I'll fix the package or the copy.

## Step 7. After approval

1. Copy the listing URL (`https://chromewebstore.google.com/detail/<id>`).
2. Update https://briskread.com/extension:
   - replace the "Load unpacked" install steps with an **Add to Chrome** button linking to the listing;
   - list the three shortcuts: Alt+Shift+S speed read, Alt+Shift+K bionic, Alt+Shift+L read later.
3. Ask early users for reviews. Ratings drive store ranking more than anything else you control.

## Shipping an update later

1. Bump `version` in `chrome-extension/manifest.json` (for example 2.0.1).
2. Run `npm run ext:test`, then `npm run ext:pack`.
3. Dashboard, then the item, then **Package**, then **Upload new package**, then **Submit for review**.
4. If a new version adds a permission that shows a warning, Chrome disables the extension for existing users until they accept it. Avoid that unless a feature truly needs it.
