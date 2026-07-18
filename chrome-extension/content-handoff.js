// Injected on APP_ORIGIN — durable handoff with retries for SW wake races.
(function () {
  if (window.__srHandoffBoot) return;
  window.__srHandoffBoot = true;

  const MAX_ATTEMPTS = 8;
  const DELAY_MS = 120;
  let applied = false;

  function apply(payload) {
    if (!payload || !payload.ok || applied) return false;
    let wrote = false;
    try {
      if (payload.license_key) {
        localStorage.setItem('license_key', payload.license_key);
        wrote = true;
      }
      if (payload.premium_token) {
        localStorage.setItem('premium_token', payload.premium_token);
        localStorage.setItem('is_premium', 'true');
        // Mark session as extension-sourced so the web app does not re-bind a 2nd device slot
        localStorage.setItem('premium_source', 'extension');
        wrote = true;
      }
      if (payload.article && (payload.article.text || payload.article.url)) {
        sessionStorage.setItem(
          'sr_extension_article',
          JSON.stringify({
            title: payload.article.title || '',
            text: payload.article.text || '',
            url: payload.article.url || '',
            wordCount: payload.article.wordCount || 0,
            source: 'chrome-extension',
          })
        );
        wrote = true;
      }
      if (wrote) {
        sessionStorage.setItem('sr_from_extension', '1');
        applied = true;
        window.dispatchEvent(new CustomEvent('sr-extension-handoff', { detail: payload }));
        chrome.runtime.sendMessage({ type: 'SR_CLEAR_HANDOFF' }).catch(() => {});
      }
    } catch (e) {
      console.warn('[SpeedRead] handoff apply failed', e);
    }
    return wrote;
  }

  function attempt(n) {
    if (applied || n >= MAX_ATTEMPTS) return;
    try {
      chrome.runtime.sendMessage({ type: 'SR_GET_HANDOFF' }, (response) => {
        if (chrome.runtime.lastError) {
          setTimeout(() => attempt(n + 1), DELAY_MS * (n + 1));
          return;
        }
        if (response && response.ok) {
          apply(response);
          // If only premium came through, still clear after first success
          if (!applied) setTimeout(() => attempt(n + 1), DELAY_MS * (n + 1));
        } else {
          setTimeout(() => attempt(n + 1), DELAY_MS * (n + 1));
        }
      });
    } catch (_) {
      setTimeout(() => attempt(n + 1), DELAY_MS * (n + 1));
    }
  }

  attempt(0);
})();
