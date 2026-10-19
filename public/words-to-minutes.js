(function (root) {
  // Rates are words per minute. "source" says how much to trust each figure:
  // 'study' = published average, 'assumption' = typical value the user can edit.
  // Speaking presets are assumptions: no primary source for them could be checked.
  const RATES = [
    { id: 'speak-slow', label: 'Speaking, slow', wpm: 110, source: 'assumption' },
    { id: 'speak-avg', label: 'Speaking, average', wpm: 130, source: 'assumption' },
    { id: 'speak-fast', label: 'Speaking, fast', wpm: 160, source: 'assumption' },
    // Brysbaert (2019), https://doi.org/10.1016/j.jml.2019.104047
    { id: 'read-aloud', label: 'Reading aloud', wpm: 183, source: 'study' },
    { id: 'silent-nonfiction', label: 'Silent reading, non-fiction', wpm: 238, source: 'study' },
    { id: 'silent-fiction', label: 'Silent reading, fiction', wpm: 260, source: 'study' },
  ];

  // speechSynthesis.rate 1 is roughly this many WPM on common English voices.
  // It differs by voice and browser, so the preview is only approximate.
  const TTS_BASE_WPM = 170;

  const countWords = (text) => {
    const t = String(text == null ? '' : text).trim();
    return t ? t.split(/\s+/).length : 0;
  };

  const secondsFor = (words, wpm) =>
    words > 0 && wpm > 0 ? Math.round((words / wpm) * 60) : 0;

  const pad = (n) => String(n).padStart(2, '0');

  // m:ss, or h:mm:ss once past an hour.
  const formatClock = (seconds) => {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  };

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const aboutMinutes = (seconds) => {
    if (!(seconds > 0)) return '0 minutes';
    const total = Math.round(seconds / 60);
    if (total === 0) return 'under a minute';
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `about ${plural(total, 'minute')}`;
    return `about ${plural(h, 'hour')}${m ? ` ${plural(m, 'minute')}` : ''}`;
  };

  // Reverse mode: minutes in, words out.
  const wordsForMinutes = (minutes, wpm) =>
    minutes > 0 && wpm > 0 ? Math.round(minutes * wpm) : 0;

  // Whole number inside [min, max]; anything unusable falls back.
  const clampInt = (value, min, max, fallback) => {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < min) return fallback;
    return Math.min(n, max);
  };

  // Map a WPM target onto the Web Speech API rate (0.5 to 2 is the range voices handle well).
  const ttsRateForWpm = (wpm) => {
    const r = wpm / TTS_BASE_WPM;
    return Math.round(Math.min(2, Math.max(0.5, r)) * 100) / 100;
  };

  // First n words of the text, original spacing kept.
  const firstWords = (text, n) => {
    const t = String(text == null ? '' : text).trim();
    if (!t) return '';
    const re = /\S+/g;
    let count = 0;
    let end = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      end = m.index + m[0].length;
      if (++count >= n) break;
    }
    return t.slice(0, end);
  };

  root.BriskReadWordsToMinutes = {
    RATES,
    TTS_BASE_WPM,
    countWords,
    secondsFor,
    formatClock,
    aboutMinutes,
    wordsForMinutes,
    clampInt,
    ttsRateForWpm,
    firstWords,
  };
})(globalThis);
