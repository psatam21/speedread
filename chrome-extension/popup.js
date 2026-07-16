document.getElementById('btn-read').addEventListener('click', async () => {
  // Query active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // Open SpeedRead website with the active tab's URL pre-populated
  // Swap speedread-web.com with your custom domain once live, or http://localhost:4321 for local testing
  const targetDomain = "https://speedread-web.com"; // "http://localhost:4321" for local developer testing
  const speedReadUrl = `${targetDomain}/?url=${encodeURIComponent(tab.url)}`;
  
  chrome.tabs.create({ url: speedReadUrl });
});
