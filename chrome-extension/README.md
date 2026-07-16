# SpeedRead Sync — Chrome Extension

A V3-compliant Google Chrome extension that allows you to instantly import the active tab's article text directly into your SpeedRead web workspace with a single click.

---

## 🛠️ How to Install in Developer Mode

Follow these simple steps to install the extension in your local Chrome browser:

1. Open **Google Chrome**.
2. In the URL bar, type: `chrome://extensions/` and press **Enter**.
3. In the top-right corner of the Extensions dashboard, toggle **Developer mode** to **ON**.
4. In the top-left corner, click **Load unpacked**.
5. Browse and select the **`chrome-extension`** directory located inside this project workspace folder.
6. The **SpeedRead Sync** extension will now appear in your list!

---

## 🚀 How to Use It

1. Click the puzzle icon in the top-right corner of your browser and click the pin icon next to **SpeedRead Sync** to pin it to your extensions bar.
2. Navigate to any long-form reading material (e.g., Wikipedia, Medium, news pages).
3. Click the extension icon and select **Speed Read Active Tab 🚀**.
4. A new tab will launch, loading the parsed article text into your SpeedRead workspace.

---

## ⚙️ Configuration (Developer Local Testing)
By default, the extension points to the production site `https://speedread-web.com`.
If you are developing locally on `http://localhost:4321`, open [`popup.js`](file:///c:/Users/satam/OneDrive%20-%20BITSoM/Side%20projects/Speedread/chrome-extension/popup.js) and change:
```javascript
const targetDomain = "https://speedread-web.com";
```
to:
```javascript
const targetDomain = "http://localhost:4321";
```
Then reload the extension on `chrome://extensions/` by clicking the circular reload arrow on the card.
