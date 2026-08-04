/**
 * BriskRead feature kit (local-first + optional cloud sync).
 * Library, queue, progress, profiles, retention, export.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'brisk_features_v1';
  const FREE_LIBRARY_CAP = 5;
  const MAX_TEXT_CHARS = 1_500_000;
  const RETENTION_CHUNK = 1000;

  const PROFILE_IDS = [
    { id: 'exam', label: 'Exam' },
    { id: 'research', label: 'Research' },
    { id: 'news', label: 'News' },
    { id: 'fiction', label: 'Fiction' },
  ];

  let syncHandler = null; // async (store) => void — set by app when logged in
  let saveListeners = [];

  function uid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return `bf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function now() {
    return Date.now();
  }

  function emptyStore() {
    return {
      version: 2,
      library: [],
      queue: [],
      highlights: [],
      retention: [],
      profiles: {}, // id -> { mode, wpm, fontSize, tts, savedAt } — user-defined only
      activeProfileId: null,
      activeLibraryId: null,
      settings: {
        retentionMode: 'auto', // 'auto' | 'manual'
        retentionChunk: RETENTION_CHUNK,
      },
      updatedAt: 0,
    };
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyStore();
      const base = emptyStore();
      return {
        ...base,
        ...parsed,
        library: Array.isArray(parsed.library) ? parsed.library : [],
        queue: Array.isArray(parsed.queue) ? parsed.queue : [],
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        retention: Array.isArray(parsed.retention) ? parsed.retention : [],
        profiles: parsed.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : {},
        settings: { ...base.settings, ...(parsed.settings || {}) },
      };
    } catch {
      return emptyStore();
    }
  }

  function saveStore(store) {
    store.updatedAt = now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (err) {
      console.warn('[BriskFeatures] save failed', err);
      return false;
    }
    saveListeners.forEach((fn) => {
      try { fn(store); } catch (_) { /* ignore */ }
    });
    if (typeof syncHandler === 'function') {
      try {
        const p = syncHandler(store);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) { /* ignore */ }
    }
    return true;
  }

  function onSave(fn) {
    if (typeof fn === 'function') saveListeners.push(fn);
    return () => {
      saveListeners = saveListeners.filter((x) => x !== fn);
    };
  }

  function setSyncHandler(fn) {
    syncHandler = typeof fn === 'function' ? fn : null;
  }

  function getStoreSnapshot() {
    return loadStore();
  }

  function replaceStore(store) {
    const next = {
      ...emptyStore(),
      ...store,
      library: Array.isArray(store.library) ? store.library : [],
      queue: Array.isArray(store.queue) ? store.queue : [],
      highlights: Array.isArray(store.highlights) ? store.highlights : [],
      retention: Array.isArray(store.retention) ? store.retention : [],
      profiles: store.profiles && typeof store.profiles === 'object' ? store.profiles : {},
      settings: { ...emptyStore().settings, ...(store.settings || {}) },
    };
    // Direct local write without re-triggering cloud (caller handles)
    next.updatedAt = store.updatedAt || now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      return { ok: false, reason: err.message };
    }
    saveListeners.forEach((fn) => {
      try { fn(next); } catch (_) { /* ignore */ }
    });
    return { ok: true, store: next };
  }

  /** Merge remote + local by item updatedAt (library/queue/highlights/retention). */
  function mergeStores(local, remote) {
    const a = local || emptyStore();
    const b = remote || emptyStore();

    function mergeById(listA, listB) {
      const map = new Map();
      [...listA, ...listB].forEach((item) => {
        if (!item || !item.id) return;
        const prev = map.get(item.id);
        const t = item.updatedAt || item.createdAt || item.addedAt || item.savedAt || 0;
        const pt = prev ? (prev.updatedAt || prev.createdAt || prev.addedAt || prev.savedAt || 0) : -1;
        if (!prev || t >= pt) map.set(item.id, item);
      });
      return [...map.values()];
    }

    const profiles = { ...(a.profiles || {}), ...(b.profiles || {}) };
    Object.keys(profiles).forEach((id) => {
      const pa = a.profiles?.[id];
      const pb = b.profiles?.[id];
      if (pa && pb) {
        profiles[id] = (pb.savedAt || 0) >= (pa.savedAt || 0) ? pb : pa;
      } else {
        profiles[id] = pb || pa;
      }
    });

    const settings =
      (b.updatedAt || 0) >= (a.updatedAt || 0)
        ? { ...emptyStore().settings, ...(a.settings || {}), ...(b.settings || {}) }
        : { ...emptyStore().settings, ...(b.settings || {}), ...(a.settings || {}) };

    return {
      ...emptyStore(),
      library: mergeById(a.library || [], b.library || []),
      queue: mergeById(a.queue || [], b.queue || []),
      highlights: mergeById(a.highlights || [], b.highlights || []).slice(0, 500),
      retention: mergeById(a.retention || [], b.retention || []).slice(0, 200),
      profiles,
      settings,
      activeProfileId: (b.updatedAt || 0) >= (a.updatedAt || 0) ? (b.activeProfileId ?? a.activeProfileId) : (a.activeProfileId ?? b.activeProfileId),
      activeLibraryId: (b.updatedAt || 0) >= (a.updatedAt || 0) ? (b.activeLibraryId ?? a.activeLibraryId) : (a.activeLibraryId ?? b.activeLibraryId),
      updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0, now()),
    };
  }

  function wordCount(text) {
    if (!text || !String(text).trim()) return 0;
    return String(text).trim().split(/\s+/).filter(Boolean).length;
  }

  function estimateMinutes(words, wpm) {
    const rate = Math.max(120, Number(wpm) || 350);
    return Math.max(1, Math.ceil(words / rate));
  }

  function truncateTitle(text, fallback) {
    const line = String(text || '')
      .split(/\n/)
      .map((s) => s.trim())
      .find(Boolean);
    if (!line) return fallback || 'Untitled';
    return line.length > 72 ? `${line.slice(0, 69)}…` : line;
  }

  // ── Settings ─────────────────────────────────────────────────────────

  function getSettings() {
    return { ...emptyStore().settings, ...loadStore().settings };
  }

  function updateSettings(partial) {
    const store = loadStore();
    store.settings = { ...store.settings, ...partial };
    saveStore(store);
    return { ok: true, settings: store.settings };
  }

  // ── Library ──────────────────────────────────────────────────────────

  function listLibrary() {
    return loadStore().library.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  function getLibraryItem(id) {
    return loadStore().library.find((item) => item.id === id) || null;
  }

  function canAddLibrary(isPremium) {
    if (isPremium) return { ok: true };
    const count = loadStore().library.length;
    if (count >= FREE_LIBRARY_CAP) {
      return {
        ok: false,
        reason: `Free plan keeps ${FREE_LIBRARY_CAP} saved docs. Upgrade for unlimited library, or delete one.`,
      };
    }
    return { ok: true };
  }

  function upsertLibrary({
    id,
    title,
    text,
    sourceType,
    sourceUrl,
    isPremium,
    progress,
    profileId,
  }) {
    const cleanText = String(text || '').slice(0, MAX_TEXT_CHARS);
    if (!cleanText.trim()) return { ok: false, reason: 'Nothing to save.' };

    const store = loadStore();
    let item = id ? store.library.find((x) => x.id === id) : null;

    if (!item) {
      const gate = canAddLibrary(!!isPremium);
      if (!gate.ok) return gate;
      item = {
        id: uid(),
        title: title || truncateTitle(cleanText, 'Untitled'),
        text: cleanText,
        sourceType: sourceType || 'paste',
        sourceUrl: sourceUrl || '',
        wordCount: wordCount(cleanText),
        createdAt: now(),
        updatedAt: now(),
        progress: progress || { index: 0, mode: 'rsvp', wpm: 350, pct: 0 },
        profileId: profileId || store.activeProfileId || null,
      };
      store.library.unshift(item);
    } else {
      item.title = title || item.title;
      item.text = cleanText;
      item.wordCount = wordCount(cleanText);
      item.sourceType = sourceType || item.sourceType;
      item.sourceUrl = sourceUrl != null ? sourceUrl : item.sourceUrl;
      item.updatedAt = now();
      if (progress) item.progress = { ...item.progress, ...progress };
      if (profileId) item.profileId = profileId;
    }

    store.activeLibraryId = item.id;
    if (!saveStore(store)) {
      return { ok: false, reason: 'Browser storage full. Delete older library items.' };
    }
    return { ok: true, item };
  }

  function updateProgress(libraryId, progress) {
    if (!libraryId) return { ok: false };
    const store = loadStore();
    const item = store.library.find((x) => x.id === libraryId);
    if (!item) return { ok: false };
    item.progress = {
      index: Math.max(0, Number(progress.index) || 0),
      mode: progress.mode || item.progress?.mode || 'rsvp',
      wpm: Number(progress.wpm) || item.progress?.wpm || 350,
      pct: Math.min(100, Math.max(0, Number(progress.pct) || 0)),
    };
    item.updatedAt = now();
    store.activeLibraryId = libraryId;
    saveStore(store);
    return { ok: true, item };
  }

  function removeLibrary(id) {
    const store = loadStore();
    store.library = store.library.filter((x) => x.id !== id);
    store.queue = store.queue.filter((q) => q.libraryId !== id);
    store.highlights = store.highlights.filter((h) => h.libraryId !== id);
    store.retention = store.retention.filter((r) => r.libraryId !== id);
    if (store.activeLibraryId === id) store.activeLibraryId = null;
    saveStore(store);
    return { ok: true };
  }

  function getActiveLibraryId() {
    return loadStore().activeLibraryId;
  }

  function setActiveLibraryId(id) {
    const store = loadStore();
    store.activeLibraryId = id || null;
    saveStore(store);
  }

  // ── Queue ────────────────────────────────────────────────────────────

  function listQueue() {
    return loadStore().queue.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function addToQueue({ libraryId, title, wordCount: words, wpm }) {
    const store = loadStore();
    if (libraryId && store.queue.some((q) => q.libraryId === libraryId && q.status !== 'done')) {
      return { ok: false, reason: 'Already in this week’s queue.' };
    }
    const entry = {
      id: uid(),
      libraryId: libraryId || null,
      title: title || 'Untitled',
      wordCount: words || 0,
      estimatedMinutes: estimateMinutes(words || 0, wpm || 350),
      status: 'pending',
      order: store.queue.length,
      addedAt: now(),
      updatedAt: now(),
    };
    store.queue.push(entry);
    saveStore(store);
    return { ok: true, entry };
  }

  function addTextToQueue({ title, text, sourceType, sourceUrl, isPremium, wpm }) {
    const saved = upsertLibrary({
      title,
      text,
      sourceType,
      sourceUrl,
      isPremium,
    });
    if (!saved.ok) return saved;
    return {
      ...addToQueue({
        libraryId: saved.item.id,
        title: saved.item.title,
        wordCount: saved.item.wordCount,
        wpm,
      }),
      item: saved.item,
    };
  }

  function setQueueStatus(id, status) {
    const store = loadStore();
    const entry = store.queue.find((q) => q.id === id);
    if (!entry) return { ok: false };
    entry.status = status;
    entry.updatedAt = now();
    saveStore(store);
    return { ok: true, entry };
  }

  function removeFromQueue(id) {
    const store = loadStore();
    store.queue = store.queue.filter((q) => q.id !== id);
    store.queue.forEach((q, i) => {
      q.order = i;
    });
    saveStore(store);
    return { ok: true };
  }

  function queueSummary(wpm) {
    const pending = listQueue().filter((q) => q.status !== 'done');
    const words = pending.reduce((s, q) => s + (q.wordCount || 0), 0);
    return {
      count: pending.length,
      words,
      minutes: estimateMinutes(words, wpm),
    };
  }

  // ── Profiles (user-defined only — no forced mode/wpm) ────────────────

  function listProfiles() {
    const store = loadStore();
    return PROFILE_IDS.map((meta) => {
      const saved = store.profiles[meta.id] || null;
      return {
        id: meta.id,
        label: meta.label,
        description: saved
          ? `Saved: ${saved.mode || '—'} · ${saved.wpm || '—'} WPM · ${saved.fontSize || '—'}px`
          : 'Empty slot — save your current settings here.',
        saved: !!saved,
        settings: saved,
      };
    });
  }

  function getActiveProfile() {
    const store = loadStore();
    const id = store.activeProfileId;
    if (!id) return null;
    const meta = PROFILE_IDS.find((p) => p.id === id);
    if (!meta) return null;
    const saved = store.profiles[id] || null;
    return {
      id,
      label: meta.label,
      description: saved
        ? `Saved: ${saved.mode || '—'} · ${saved.wpm || '—'} WPM`
        : 'Empty — choose mode/speed yourself, then Save to profile.',
      saved: !!saved,
      settings: saved,
    };
  }

  function setActiveProfile(id) {
    if (!PROFILE_IDS.some((p) => p.id === id)) return { ok: false, reason: 'Unknown profile' };
    const store = loadStore();
    store.activeProfileId = id;
    saveStore(store);
    return { ok: true, profile: getActiveProfile() };
  }

  /** Save current reader settings into a named profile slot. */
  function saveProfileSettings(id, settings) {
    if (!PROFILE_IDS.some((p) => p.id === id)) return { ok: false, reason: 'Unknown profile' };
    const store = loadStore();
    store.profiles[id] = {
      mode: settings.mode || null,
      wpm: Number(settings.wpm) || null,
      fontSize: Number(settings.fontSize) || null,
      tts: !!settings.tts,
      font: settings.font || null,
      savedAt: now(),
    };
    store.activeProfileId = id;
    saveStore(store);
    return { ok: true, profile: getActiveProfile() };
  }

  function clearProfile(id) {
    const store = loadStore();
    delete store.profiles[id];
    if (store.activeProfileId === id) store.activeProfileId = null;
    saveStore(store);
    return { ok: true };
  }

  // ── Chapters ─────────────────────────────────────────────────────────

  function detectChapters(text, words) {
    const source = String(text || '');
    if (!source.trim()) return [];

    const wordList = Array.isArray(words) && words.length
      ? words
      : source.trim().split(/\s+/).filter(Boolean);

    const chapters = [];
    const lines = source.split(/\n/);
    let charPos = 0;

    function advanceWordsTo(charTarget) {
      const slice = source.slice(0, Math.min(charTarget, source.length));
      const count = slice.trim() ? slice.trim().split(/\s+/).filter(Boolean).length : 0;
      return Math.min(wordList.length - 1, Math.max(0, count));
    }

    lines.forEach((line) => {
      const trimmed = line.trim();
      const lineStart = charPos;
      charPos += line.length + 1;

      if (!trimmed || trimmed.length > 80) return;
      if (trimmed.split(/\s+/).length > 12) return;

      const isMd = /^#{1,3}\s+\S/.test(trimmed);
      const isChapterWord = /^chapter\s+\d+/i.test(trimmed) || /^part\s+\d+/i.test(trimmed);
      const isNumbered = /^\d+(\.\d+)*\s+[A-Za-z]/.test(trimmed) && trimmed.length < 70;
      const isAllCaps =
        trimmed === trimmed.toUpperCase() &&
        /[A-Z]/.test(trimmed) &&
        trimmed.length >= 5 &&
        trimmed.length <= 48 &&
        !/https?:/i.test(trimmed);

      if (!(isMd || isChapterWord || isNumbered || isAllCaps)) return;

      const title = trimmed.replace(/^#{1,3}\s+/, '').trim();
      const idx = advanceWordsTo(lineStart);
      if (chapters.length && Math.abs(chapters[chapters.length - 1].wordIndex - idx) < 8) return;

      chapters.push({
        id: `ch-${chapters.length + 1}`,
        title: title.length > 64 ? `${title.slice(0, 61)}…` : title,
        wordIndex: idx,
        pct: wordList.length ? Math.round((idx / Math.max(1, wordList.length - 1)) * 100) : 0,
      });
    });

    if (!chapters.length || chapters[0].wordIndex > 0) {
      chapters.unshift({ id: 'ch-start', title: 'Beginning', wordIndex: 0, pct: 0 });
    }

    return chapters.slice(0, 80);
  }

  function remainingEstimate(wordIndex, totalWords, wpm) {
    const left = Math.max(0, (totalWords || 0) - (wordIndex || 0));
    return {
      wordsLeft: left,
      minutesLeft: estimateMinutes(left, wpm),
    };
  }

  // ── Highlights ───────────────────────────────────────────────────────

  function addHighlight({ libraryId, text, wordIndex, note }) {
    const store = loadStore();
    const entry = {
      id: uid(),
      libraryId: libraryId || store.activeLibraryId || null,
      text: String(text || '').slice(0, 500),
      wordIndex: Number(wordIndex) || 0,
      note: String(note || '').slice(0, 500),
      createdAt: now(),
      updatedAt: now(),
    };
    if (!entry.text.trim()) return { ok: false, reason: 'Empty highlight' };
    store.highlights.unshift(entry);
    store.highlights = store.highlights.slice(0, 500);
    saveStore(store);
    return { ok: true, entry };
  }

  function listHighlights(libraryId) {
    const all = loadStore().highlights;
    if (!libraryId) return all;
    return all.filter((h) => h.libraryId === libraryId);
  }

  function removeHighlight(id) {
    const store = loadStore();
    store.highlights = store.highlights.filter((h) => h.id !== id);
    saveStore(store);
    return { ok: true };
  }

  // ── Retention (MCQs only, default every 1000 words) ──────────────────

  function getRetentionChunk() {
    const n = Number(getSettings().retentionChunk) || RETENTION_CHUNK;
    return Math.max(200, Math.min(5000, n));
  }

  function shouldOfferRetention(wordIndex, lastPromptIndex) {
    if (getSettings().retentionMode !== 'auto') return false;
    const chunk = getRetentionChunk();
    if (wordIndex < chunk) return false;
    const last = Number(lastPromptIndex) || 0;
    return wordIndex - last >= chunk;
  }

  function shuffleUnique(arr) {
    const a = [...new Set(arr.filter(Boolean))];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Build MCQs only from the text chunk (no free-text answers).
   */
  function buildRetentionCheck({ text, words, fromIndex, toIndex }) {
    const start = Math.max(0, fromIndex || 0);
    const end = Math.min((words || []).length, toIndex || start + getRetentionChunk());
    const sliceWords = (words || []).slice(start, end);
    const chunk = sliceWords.join(' ') || String(text || '').slice(0, 4000);
    if (sliceWords.length < 50) return null;

    const stop = new Set(
      'the a an and or but if in on at to for of as is was are were be been being this that these those it its with from by not no yes you your we they he she their our my me him her them into about over after before under again further then once here there when where why how all each few more most other some such only own same so than too very can will just should now what which who whom whose been has have had did does do been'.split(
        ' '
      )
    );

    const freq = new Map();
    sliceWords.forEach((w) => {
      const key = String(w).toLowerCase().replace(/[^a-z0-9'-]/gi, '');
      if (key.length < 5 || stop.has(key)) return;
      freq.set(key, (freq.get(key) || 0) + 1);
    });
    const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
    const terms = ranked.slice(0, 8);
    if (terms.length < 2) return null;

    const sentences = chunk
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 35 && s.length < 240);

    const questions = [];

    // Q1: most frequent topic word
    questions.push({
      id: 'q1',
      type: 'mcq',
      prompt: `Which word or idea shows up most in the last ~${end - start} words?`,
      options: shuffleUnique([
        terms[0],
        terms[1] || 'context',
        terms[2] || 'background',
        terms[3] || 'detail',
      ]).slice(0, 4),
      answer: terms[0],
    });

    // Q2: cloze from a real sentence if available
    const clozeSource = sentences.find((s) =>
      terms.some((t) => new RegExp(`\\b${t}\\b`, 'i').test(s))
    );
    if (clozeSource) {
      const term = terms.find((t) => new RegExp(`\\b${t}\\b`, 'i').test(clozeSource)) || terms[0];
      const blanked = clozeSource.replace(new RegExp(`\\b${term}\\b`, 'i'), '______');
      questions.push({
        id: 'q2',
        type: 'mcq',
        prompt: `Fill the blank from the text: “${blanked.length > 160 ? `${blanked.slice(0, 157)}…` : blanked}”`,
        options: shuffleUnique([
          term,
          terms.find((t) => t !== term) || 'process',
          terms.find((t) => t !== term && t !== terms[1]) || 'result',
          ranked[4] || ranked[3] || 'system',
        ]).slice(0, 4),
        answer: term,
      });
    } else {
      questions.push({
        id: 'q2',
        type: 'mcq',
        prompt: `Which of these also appears often in this section?`,
        options: shuffleUnique([
          terms[1] || terms[0],
          terms[0],
          terms[2] || 'structure',
          terms[3] || 'example',
        ]).slice(0, 4),
        answer: terms[1] || terms[0],
      });
    }

    // Q3: which sentence belongs to the passage
    if (sentences.length >= 2) {
      const real = sentences[Math.floor(sentences.length / 2)] || sentences[0];
      const distractors = [
        'The author never addresses this topic and moves on to unrelated weather data.',
        'This section is only a table of contents without any argument or detail.',
        'All claims in this passage are pure fiction with no factual framing.',
      ];
      questions.push({
        id: 'q3',
        type: 'mcq',
        prompt: 'Which sentence is closest to something that actually appeared in this section?',
        options: shuffleUnique([
          real.length > 140 ? `${real.slice(0, 137)}…` : real,
          ...distractors,
        ]).slice(0, 4),
        answer: real.length > 140 ? `${real.slice(0, 137)}…` : real,
      });
    } else {
      questions.push({
        id: 'q3',
        type: 'mcq',
        prompt: `What role does “${terms[0]}” play in this section?`,
        options: shuffleUnique([
          'It is a central idea in the passage',
          'It never appears in the text',
          'It is only a page number reference',
          'It is pure decorative filler',
        ]),
        answer: 'It is a central idea in the passage',
      });
    }

    return {
      fromIndex: start,
      toIndex: end,
      terms: terms.slice(0, 5),
      questions,
    };
  }

  function saveRetention({ libraryId, fromIndex, toIndex, answers, terms, score }) {
    const store = loadStore();
    const entry = {
      id: uid(),
      libraryId: libraryId || store.activeLibraryId || null,
      fromIndex,
      toIndex,
      answers: answers || {},
      summary: '',
      terms: terms || [],
      score: score != null ? score : null,
      createdAt: now(),
      updatedAt: now(),
    };
    store.retention.unshift(entry);
    store.retention = store.retention.slice(0, 200);
    saveStore(store);
    return { ok: true, entry };
  }

  function listRetention(libraryId) {
    const all = loadStore().retention;
    if (!libraryId) return all;
    return all.filter((r) => r.libraryId === libraryId);
  }

  // ── Export ───────────────────────────────────────────────────────────

  function exportMarkdown({ libraryId, includeRetention = true, includeHighlights = true, meta = {} }) {
    const store = loadStore();
    const item = libraryId ? store.library.find((x) => x.id === libraryId) : null;
    const title = item?.title || meta.title || 'BriskRead export';
    const lines = [];
    lines.push(`# ${title}`);
    lines.push('');
    lines.push(`_Exported ${new Date().toISOString().slice(0, 10)} · BriskRead_`);
    lines.push('');

    if (meta.summary) {
      lines.push('## Summary');
      lines.push('');
      lines.push(String(meta.summary).trim());
      lines.push('');
    }

    if (item) {
      const p = item.progress || {};
      lines.push('## Reading progress');
      lines.push('');
      lines.push(`- Words: ${item.wordCount || 0}`);
      lines.push(`- Position: word ${(p.index || 0) + 1} (${p.pct || 0}%)`);
      lines.push(`- Mode: ${p.mode || '—'}`);
      lines.push(`- WPM: ${p.wpm || '—'}`);
      if (item.sourceUrl) lines.push(`- Source: ${item.sourceUrl}`);
      lines.push('');
    }

    if (includeHighlights) {
      const hs = listHighlights(libraryId || item?.id);
      if (hs.length) {
        lines.push('## Highlights');
        lines.push('');
        hs.forEach((h) => {
          lines.push(`- “${h.text}”${h.note ? ` — ${h.note}` : ''} _(word ${h.wordIndex + 1})_`);
        });
        lines.push('');
      }
    }

    if (includeRetention) {
      const rs = listRetention(libraryId || item?.id);
      if (rs.length) {
        lines.push('## Retention checks');
        lines.push('');
        rs.forEach((r) => {
          lines.push(`### Chunk words ${r.fromIndex + 1}–${r.toIndex}`);
          if (r.score != null) lines.push(`- Score: ${r.score}`);
          if (r.terms?.length) lines.push(`- Terms: ${r.terms.join(', ')}`);
          if (r.answers && Object.keys(r.answers).length) {
            Object.entries(r.answers).forEach(([k, v]) => {
              lines.push(`- ${k}: ${v}`);
            });
          }
          lines.push('');
        });
      }
    }

    if (meta.includeBody && item?.text) {
      lines.push('## Full text');
      lines.push('');
      lines.push(item.text);
      lines.push('');
    }

    if (meta.extraNotes) {
      lines.push('## Notes');
      lines.push('');
      lines.push(String(meta.extraNotes).trim());
      lines.push('');
    }

    lines.push('---');
    lines.push('_Made with [BriskRead](https://briskread.com)_');
    return lines.join('\n');
  }

  /** Export entire queue (pending by default) as one MD for AI summarization. */
  function exportQueueMarkdown({ includeDone = false, includeFullText = true } = {}) {
    const store = loadStore();
    const items = listQueue().filter((q) => includeDone || q.status !== 'done');
    const lines = [];
    lines.push('# BriskRead reading queue');
    lines.push('');
    lines.push(`_Exported ${new Date().toISOString().slice(0, 10)} · ${items.length} item(s)_`);
    lines.push('');
    lines.push('Use this file with any AI to summarize, prioritize, or extract action items.');
    lines.push('');

    if (!items.length) {
      lines.push('_Queue is empty._');
      return lines.join('\n');
    }

    items.forEach((q, i) => {
      const lib = q.libraryId ? store.library.find((x) => x.id === q.libraryId) : null;
      lines.push(`## ${i + 1}. ${q.title || lib?.title || 'Untitled'}`);
      lines.push('');
      lines.push(`- Status: ${q.status || 'pending'}`);
      lines.push(`- Words: ${q.wordCount || lib?.wordCount || 0}`);
      lines.push(`- Est. minutes: ${q.estimatedMinutes || '—'}`);
      if (lib?.sourceUrl) lines.push(`- Source: ${lib.sourceUrl}`);
      if (lib?.progress) {
        lines.push(`- Progress: ${lib.progress.pct || 0}% (word ${(lib.progress.index || 0) + 1})`);
      }
      lines.push('');
      if (includeFullText && lib?.text) {
        lines.push('### Text');
        lines.push('');
        lines.push(lib.text);
        lines.push('');
      } else if (!lib) {
        lines.push('_Full text not in library for this queue item._');
        lines.push('');
      }
    });

    lines.push('---');
    lines.push('_Made with [BriskRead](https://briskread.com)_');
    return lines.join('\n');
  }

  function downloadText(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'briskread-export.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error('Clipboard unavailable'));
  }

  const api = {
    FREE_LIBRARY_CAP,
    RETENTION_CHUNK,
    estimateMinutes,
    wordCount,
    truncateTitle,
    getSettings,
    updateSettings,
    listLibrary,
    getLibraryItem,
    canAddLibrary,
    upsertLibrary,
    updateProgress,
    removeLibrary,
    getActiveLibraryId,
    setActiveLibraryId,
    listQueue,
    addToQueue,
    addTextToQueue,
    setQueueStatus,
    removeFromQueue,
    queueSummary,
    listProfiles,
    getActiveProfile,
    setActiveProfile,
    saveProfileSettings,
    clearProfile,
    detectChapters,
    remainingEstimate,
    addHighlight,
    listHighlights,
    removeHighlight,
    shouldOfferRetention,
    buildRetentionCheck,
    saveRetention,
    listRetention,
    getRetentionChunk,
    exportMarkdown,
    exportQueueMarkdown,
    downloadText,
    copyText,
    loadStore,
    getStoreSnapshot,
    replaceStore,
    mergeStores,
    setSyncHandler,
    onSave,
  };

  global.BriskFeatures = api;
})(typeof window !== 'undefined' ? window : globalThis);
