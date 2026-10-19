(function (root) {
  // Pure teleprompter logic. No DOM access, so scripts/test-teleprompter.mjs can run it in node.
  const LIMITS = {
    wpm: [40, 300],
    font: [24, 160],
    width: [40, 100],
    lh: [1.1, 2.2],
  };
  const DEFAULTS = { wpm: 150, font: 56, width: 80, lh: 1.5, mirrorH: false, mirrorV: false };
  const WPM_STEP = 10;
  // A hidden tab or a stalled frame can report seconds of elapsed time. Capping one
  // frame stops the text from leaping forward when the page wakes up again.
  const MAX_FRAME_MS = 200;
  const MAX_SCRIPT_CHARS = 200000;

  const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

  const clamp = (n, lo, hi) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return lo;
    return Math.min(hi, Math.max(lo, v));
  };

  // Out-of-range values are pulled in; junk (NaN, text, undefined) falls back to the default.
  const clampSetting = (key, value) => {
    const [lo, hi] = LIMITS[key];
    const v = Number(value);
    return Number.isFinite(v) && value !== null && value !== '' ? clamp(v, lo, hi) : DEFAULTS[key];
  };

  const stepWpm = (wpm, direction) => clampSetting('wpm', clampSetting('wpm', wpm) + direction * WPM_STEP);

  const countWords = (text) => {
    const t = String(text == null ? '' : text).trim();
    return t ? t.split(/\s+/).length : 0;
  };

  // Pixels per second so the whole script travels `distance` px in exactly
  // words / wpm minutes: distance / (words / wpm * 60). Anything unusable gives 0 (stand still).
  const scrollSpeed = (distance, words, wpm) => {
    if (!isNum(distance) || !isNum(words) || !isNum(wpm)) return 0;
    if (distance <= 0 || words <= 0 || wpm <= 0) return 0;
    return distance / ((words / wpm) * 60);
  };

  const estimateSeconds = (words, wpm) => {
    if (!isNum(words) || !isNum(wpm) || words <= 0 || wpm <= 0) return 0;
    return (words / wpm) * 60;
  };

  const formatClock = (seconds) => {
    const total = isNum(seconds) ? Math.max(0, Math.round(seconds)) : 0;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  };

  const frameMs = (dtMs) => (isNum(dtMs) ? Math.min(MAX_FRAME_MS, Math.max(0, dtMs)) : 0);

  // New scroll position after one frame. Position is a float that only ever moves by
  // speed * dt, so changing the speed between frames cannot make the text jump.
  const advance = (pos, speed, dtMs, max) => {
    const top = isNum(max) ? Math.max(0, max) : 0;
    const speedPx = isNum(speed) ? Math.max(0, speed) : 0;
    return clamp((isNum(pos) ? pos : 0) + (speedPx * frameMs(dtMs)) / 1000, 0, top);
  };

  const progress = (pos, max) => (isNum(pos) && isNum(max) && max > 0 ? clamp(pos / max, 0, 1) : 0);

  const remainingSeconds = (pos, max, speed) => {
    if (!isNum(pos) || !isNum(max) || !isNum(speed) || speed <= 0) return 0;
    return Math.max(0, max - pos) / speed;
  };

  // When the text reflows (font size, window size, rotation) keep the reader at the same
  // fraction of the script instead of the same pixel offset.
  const rescalePosition = (pos, oldMax, newMax) => {
    if (!isNum(newMax) || newMax <= 0) return 0;
    return clamp(progress(pos, oldMax), 0, 1) * newMax;
  };

  // Turns whatever came out of localStorage into a safe settings object.
  const sanitize = (raw) => {
    const o = raw && typeof raw === 'object' ? raw : {};
    return {
      script: typeof o.script === 'string' ? o.script.slice(0, MAX_SCRIPT_CHARS) : '',
      wpm: clampSetting('wpm', o.wpm),
      font: clampSetting('font', o.font),
      width: clampSetting('width', o.width),
      lh: clampSetting('lh', o.lh),
      mirrorH: o.mirrorH === true,
      mirrorV: o.mirrorV === true,
    };
  };

  root.BriskReadTeleprompter = {
    LIMITS,
    DEFAULTS,
    WPM_STEP,
    MAX_FRAME_MS,
    clamp,
    clampSetting,
    stepWpm,
    countWords,
    scrollSpeed,
    estimateSeconds,
    formatClock,
    frameMs,
    advance,
    progress,
    remainingSeconds,
    rescalePosition,
    sanitize,
  };
})(globalThis);
