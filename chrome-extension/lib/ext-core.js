/* Pure, extension-only helpers shared by the overlay, page bionic, the service
   worker and node tests. No DOM, no chrome.* here. reader-core.js stays a
   verbatim copy of the site's file, so extension-specific logic lives here. */
(function (root) {
  const DEFAULT_SETTINGS = {
    wpm: 350,
    mode: 'rsvp',
    theme: 'dark',
    size: 'm',
    audio: false,
    voice: '',
    ramp: true,
  };
  const MODES = ['rsvp', 'focus', 'phrase', 'flow', 'bionic', 'standard'];
  const THEMES = ['dark', 'light', 'sepia'];
  const SIZES = ['s', 'm', 'l'];
  const WPM_MIN = 100;
  const WPM_MAX = 1200;

  const clampWpm = (n) => Math.max(WPM_MIN, Math.min(WPM_MAX, Math.round((Number(n) || 350) / 25) * 25));

  /** Coerce whatever is in storage into a valid settings object. */
  const normalizeSettings = (raw) => {
    const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
    return {
      wpm: clampWpm(s.wpm),
      mode: MODES.includes(s.mode) ? s.mode : DEFAULT_SETTINGS.mode,
      theme: THEMES.includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
      size: SIZES.includes(s.size) ? s.size : DEFAULT_SETTINGS.size,
      audio: s.audio === true,
      voice: typeof s.voice === 'string' ? s.voice : '',
      ramp: s.ramp !== false,
    };
  };

  /**
   * Per-word display time. Long words and punctuation get extra time; the first
   * few words after pressing play ramp in so the eye can lock on (`sincePlay`).
   */
  const delayFor = (word, wpm, sincePlay = 99) => {
    let delay = 60000 / wpm;
    if (word.length >= 12) delay *= 1.35;
    else if (word.length >= 8) delay *= 1.15;
    if (/[.!?]["')\]]*$/.test(word)) delay *= 1.8;
    else if (/[,;:]["')\]]*$/.test(word)) delay *= 1.3;
    if (sincePlay < 4) delay *= 1.8 - sincePlay * 0.2;
    return delay;
  };

  /** Bold fixation length, same formula as the site's Bionic converter. */
  const bionicHead = (word) => {
    if (word.length <= 1) return word.length;
    if (word.length === 3) return 2;
    return Math.ceil(word.length * 0.4);
  };

  /** Start offset of every whitespace-separated word in `text`. */
  const wordStarts = (text) => {
    const starts = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text))) starts.push(m.index);
    return starts;
  };

  /** Index of the word containing (or just before) `charIndex`. Binary search. */
  const wordAt = (starts, charIndex) => {
    let lo = 0;
    let hi = starts.length - 1;
    if (hi < 0) return 0;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= charIndex) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  /** Speech rate for a WPM. ~150 wpm is rate 1.0 for most voices (site uses the same). */
  const rateForWpm = (wpm) => Math.min(3, Math.max(0.5, wpm / 150));

  /**
   * Rank voices so natural/neural cloud voices win: Edge "Online (Natural)",
   * Chrome's Google voices, macOS Enhanced/Premium. Mirrors the site's ranking.
   */
  const voiceScore = (voice, preferLang = 'en') => {
    const name = voice.name || '';
    const lang = (voice.lang || '').toLowerCase();
    let score = 0;
    if (lang.startsWith(preferLang.toLowerCase())) score += 100;
    if (/natural/i.test(name)) score += 60;
    if (/neural/i.test(name)) score += 45;
    if (/enhanced|premium|siri/i.test(name)) score += 35;
    if (/google/i.test(name)) score += 30;
    if (/online\s*\(/i.test(name)) score += 20;
    if (voice.localService === false) score += 12;
    if (/microsoft (david|zira|mark)\b/i.test(name)) score -= 40;
    return score;
  };

  // Pages where Chrome never lets an extension run scripts.
  const BLOCKED_URL =
    /^(chrome|chrome-extension|chrome-search|chrome-untrusted|devtools|edge|about|view-source|brave|opera|vivaldi):|^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/i;
  const isBlockedUrl = (url) => !url || BLOCKED_URL.test(url);
  const isPdfUrl = (url) => /^[^?#]+\.pdf([?#]|$)/i.test(url || '');

  /** Resume key for a page: URL without the hash. */
  const progressKey = (url) => String(url || '').split('#')[0];

  /** Resume only when the same text is back and the reader is not near the end. */
  const resumeIndex = (entry, wordCount) => {
    if (!entry || entry.n !== wordCount) return 0;
    if (entry.i < 20 || entry.i > wordCount - 20) return 0;
    return entry.i;
  };

  const minutesFor = (words, wpm) => Math.max(1, Math.ceil(words / wpm));

  root.BriskReadExt = {
    DEFAULT_SETTINGS,
    MODES,
    THEMES,
    SIZES,
    WPM_MIN,
    WPM_MAX,
    clampWpm,
    normalizeSettings,
    delayFor,
    bionicHead,
    wordStarts,
    wordAt,
    rateForWpm,
    voiceScore,
    isBlockedUrl,
    isPdfUrl,
    progressKey,
    resumeIndex,
    minutesFor,
  };
})(globalThis);
