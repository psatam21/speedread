/*
 * BriskRead readability maths. Pure functions, no DOM, no network.
 * Loaded by /readability-checker with a plain <script>, and by
 * scripts/test-readability.mjs under node. Mirrors reader-core.js: one IIFE on globalThis.
 *
 * ponytail: syllables and sentence splits are rule-based heuristics, not a dictionary
 * or an NLP model. Add a pronouncing dictionary only if scores must match Word to the decimal.
 */
(function (root) {
  const WPM_READ = 238; // Brysbaert 2019, silent reading of English non-fiction
  const WPM_SPEAK = 150; // rough speaking pace; shown as approximate
  const HARD_WORDS = 20;
  const VERY_HARD_WORDS = 30;
  const SMOG_MIN_SENTENCES = 30;

  // Flesch (1948) bands. Single source for the live label and the table on the page.
  const BANDS = [
    { min: 90, range: '90-100', label: 'Very easy', grade: '5th grade', note: 'Easily understood by an average 11-year-old.' },
    { min: 80, range: '80-90', label: 'Easy', grade: '6th grade', note: 'Conversational English.' },
    { min: 70, range: '70-80', label: 'Fairly easy', grade: '7th grade', note: 'Easy for most adults.' },
    { min: 60, range: '60-70', label: 'Plain English', grade: '8th to 9th grade', note: 'Understood by most 13 to 15 year olds.' },
    { min: 50, range: '50-60', label: 'Fairly difficult', grade: '10th to 12th grade', note: 'Takes some effort.' },
    { min: 30, range: '30-50', label: 'Difficult', grade: 'college', note: 'Best for readers with some college.' },
    { min: -Infinity, range: '0-30', label: 'Very difficult', grade: 'college graduate', note: 'Best for specialist readers.' },
  ];
  const bandFor = (score) => BANDS.find((b) => score >= b.min) || BANDS[BANDS.length - 1];

  const div = (a, b) => (b ? a / b : 0);
  const round = (n, d = 1) => {
    const f = 10 ** d;
    return Math.round(n * f) / f;
  };

  // ---------------------------------------------------------------- syllables

  // Words the rules get wrong. Lowercase, letters only.
  const SYLLABLE_EXCEPTIONS = {
    area: 3, areas: 3, idea: 3, ideas: 3, people: 2, every: 2, everyone: 3, everything: 3,
    everywhere: 3, business: 2, businesses: 3, rhythm: 2, rhythms: 2, science: 2, sciences: 3,
    scientist: 3, scientists: 3, scientific: 4, something: 2, sometimes: 2, someone: 2,
    somewhere: 2, somehow: 2, create: 2, creates: 2, created: 3, creating: 3, creation: 3,
    creative: 3, creator: 3, creators: 3, poem: 2, poems: 2, poet: 2, poets: 2, poetry: 3,
    quiet: 2, eye: 1, eyes: 1, lion: 2, lions: 2, persuade: 2, persuaded: 3, rely: 2,
    experience: 4, experiences: 4, aisle: 1, isle: 1, giant: 2, diet: 2, client: 2, clients: 2,
    wednesday: 2,
  };


  const countVowelGroups = (w) => {
    const m = w.match(/[aeiouy]+/g);
    return m ? m.length : 0;
  };

  // One hyphen-free alphabetic chunk -> syllables (always at least 1).
  const syllablesOfChunk = (chunk) => {
    let w = chunk.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
    if (!w) return 1; // digits, symbols or non-Latin script: count as one beat
    if (Object.prototype.hasOwnProperty.call(SYLLABLE_EXCEPTIONS, w)) return SYLLABLE_EXCEPTIONS[w];

    // y between vowels (beyond, player, royal) or opening a syllable (yes, young) is a consonant.
    w = w.replace(/^y(?=[aeiou])/, '_').replace(/([aeiou])y(?=[aeiou])/g, '$1_');

    // Silent endings. "_" is a consonant stand-in so it is excluded from vowel classes below.
    if (/[^aeiouy_]le$/.test(w)) {
      // table, simple: the -le is its own syllable, leave it alone
    } else if (/[^aeiouy_]les$/.test(w)) {
      // tables
    } else if (/(?:[sxzcg]|ch|sh)es$/.test(w)) {
      // boxes, places, wishes: -es is its own syllable
    } else if (/[^aeiouy_]es$/.test(w)) {
      w = w.slice(0, -2); // makes, homes
    } else if (/[^aeiouytd]ed$/.test(w)) {
      w = w.slice(0, -2); // walked, loved (wanted and needed keep theirs)
    } else if (/[^aeiouy_]e$/.test(w)) {
      w = w.slice(0, -1); // make, home
    }
    // Silent e before a suffix: safely, statement, careful, hopeless, likeness (but not -lement: element).
    w = w.replace(/([^aeiouy_l])e(ly|ment|ful|less|ness)/, '$1$2');

    let n = countVowelGroups(w);
    // Vowel pairs that are really two syllables.
    if (/[^aeioucgtsxl]ia/.test(w)) n += 1; // media, trial, material
    if (/[^aeioucgtsxln]io(?!u)/.test(w)) n += 1; // radio, violin, biology
    if (/[^aeioucgtsxn]iu/.test(w)) n += 1; // medium, stadium
    if (/[^aeioucgtsx]iou/.test(w)) n += 1; // serious, various
    if (/[^qg]ua/.test(w)) n += 1; // usual, actual, individual
    if (/uou/.test(w)) n += 1; // continuous
    if (/eo(?!n)/.test(w)) n += 1; // video, theory, geometry
    if (/iet(?:y|ies)$/.test(w)) n += 1; // society, anxiety
    if (/[aeiouy]ing$/.test(w)) n += 1; // being, doing, dying
    if (/[aeiou]sm$/.test(w)) n += 1; // prism, capitalism, sarcasm
    return Math.max(1, n);
  };

  const countSyllables = (word) => {
    const s = String(word == null ? '' : word);
    if (/^\p{L}(?:\.\p{L})+$/u.test(s)) return s.replace(/\./g, '').length; // U.S, e.g: one beat per letter
    return s.split(/-/).reduce((sum, part) => sum + (part ? syllablesOfChunk(part) : 0), 0) || 1;
  };

  // ---------------------------------------------------------------- tokens

  // Dotted abbreviations (U.S, e.g), numbers with separators (3.14, 1,000), then ordinary words.
  const WORD_RE = /\p{L}(?:\.\p{L})+|\d+(?:[.,]\d+)+\p{L}*|[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

  const tokenizeWords = (text, offset = 0) => {
    const out = [];
    WORD_RE.lastIndex = 0;
    let m;
    while ((m = WORD_RE.exec(text))) out.push({ text: m[0], start: offset + m.index, end: offset + m.index + m[0].length });
    return out;
  };

  // Titles and abbreviations that never end a sentence.
  const NEVER_END = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'mt', 'vs', 'fig', 'cf', 'approx', 'dept',
    'gen', 'gov', 'rev', 'hon', 'sen', 'rep', 'lt', 'col', 'capt', 'sgt', 'vol', 'al', 'e.g', 'i.e']);
  // These end a sentence only when a capitalised word follows.
  const MAYBE_END = new Set(['etc', 'inc', 'ltd', 'co', 'corp', 'jr', 'sr']);

  // Is the terminator run m (inside paragraph par) a real sentence end? `from` is where this sentence began.
  const isBoundary = (par, m, from) => {
    const run = m[1];
    const closers = m[2];
    const after = par.slice(m.index + m[0].length);
    const nextCh = (/^\s*["'“‘(\[]*(\S)/.exec(after) || [])[1] || '';
    const nextUpper = /\p{Lu}/u.test(nextCh);

    if (/[!?]/.test(run)) {
      // "Stop!" he said: a closing quote followed by lower case is a dialogue tag, not a new sentence.
      return !(closers && /["”’')]/.test(closers) && /\p{Ll}/u.test(nextCh));
    }
    if (/…|\.{2,}/.test(run)) return nextUpper; // "Well... maybe" continues; "Well... Maybe" does not

    const before = par.slice(from, m.index);
    if (/^\s*[(\[]?\d+$/.test(before)) return false; // list marker: "1. Buy milk"
    const tok = ((/(\S+)$/.exec(before) || [])[1] || '').replace(/^[^\p{L}\p{N}]+/u, '');
    const low = tok.toLowerCase();
    if (NEVER_END.has(low)) return false;
    if (/^\p{Lu}$/u.test(tok) && tok !== 'I') return false; // initials: J. K. Rowling
    // ponytail: dotted abbreviations (U.S. a.m.) never end a sentence. "the U.S. Navy" is commoner than "...in the U.S. She".
    if (/^(?:\p{L}\.)+\p{L}$/u.test(tok)) return false;
    if (MAYBE_END.has(low)) return nextUpper;
    return true;
  };

  // -> [{ start, end }] offsets into text, trimmed. Blank lines always end a sentence (headings, list items).
  const splitSentences = (text) => {
    const out = [];
    const push = (a, b) => {
      const slice = text.slice(a, b);
      if (!/[\p{L}\p{N}]/u.test(slice)) return;
      const lead = /^\s*/.exec(slice)[0].length;
      const trail = /\s*$/.exec(slice)[0].length;
      out.push({ start: a + lead, end: b - trail });
    };
    const paraRe = /(?:\r?\n[ \t]*){2,}/g;
    const paras = [];
    let last = 0;
    let pm;
    while ((pm = paraRe.exec(text))) {
      paras.push([last, pm.index]);
      last = pm.index + pm[0].length;
    }
    paras.push([last, text.length]);

    for (const [pa, pb] of paras) {
      const par = text.slice(pa, pb);
      const re = /([.!?…]+)(["”’')\]]*)(?=\s|$)/g;
      let from = 0;
      let m;
      while ((m = re.exec(par))) {
        if (isBoundary(par, m, from)) {
          const end = m.index + m[0].length;
          push(pa + from, pa + end);
          from = end;
        }
      }
      push(pa + from, pa + par.length); // trailing text with no final period is still a sentence
    }
    return out;
  };

  // ---------------------------------------------------------------- analysis

  const analyze = (input) => {
    const text = String(input == null ? '' : input);
    const sentences = [];
    const complexRanges = [];
    let words = 0, syllables = 0, complexWords = 0, letters = 0, alnum = 0;

    for (const s of splitSentences(text)) {
      const toks = tokenizeWords(text.slice(s.start, s.end), s.start);
      if (!toks.length) continue;
      for (const t of toks) {
        const syl = countSyllables(t.text);
        syllables += syl;
        letters += (t.text.match(/\p{L}/gu) || []).length;
        alnum += (t.text.match(/[\p{L}\p{N}]/gu) || []).length;
        // Complex = 3+ syllables. A hyphenated compound is judged by its longest part (twenty-three is easy).
        const longest = Math.max(...t.text.split('-').map((p) => countSyllables(p)));
        if (longest >= 3) {
          complexWords += 1;
          complexRanges.push({ start: t.start, end: t.end, syllables: syl });
        }
      }
      words += toks.length;
      sentences.push({
        start: s.start,
        end: s.end,
        words: toks.length,
        level: toks.length >= VERY_HARD_WORDS ? 'veryhard' : toks.length >= HARD_WORDS ? 'hard' : 'ok',
      });
    }

    const nSent = sentences.length;
    const wps = div(words, nSent); // words per sentence
    const spw = div(syllables, words); // syllables per word
    const smogReliable = nSent >= SMOG_MIN_SENTENCES;

    // Formulas exactly as published. Sources are linked on the page.
    const fleschReadingEase = words ? 206.835 - 1.015 * wps - 84.6 * spw : 0; // Flesch 1948
    const fleschKincaid = words ? 0.39 * wps + 11.8 * spw - 15.59 : 0; // Kincaid et al. 1975
    const gunningFog = words ? 0.4 * (wps + 100 * div(complexWords, words)) : 0; // Gunning 1952
    const smog = words ? 1.043 * Math.sqrt(complexWords * div(30, nSent)) + 3.1291 : 0; // McLaughlin 1969
    const L = div(letters, words) * 100; // letters per 100 words
    const S = div(nSent, words) * 100; // sentences per 100 words
    const colemanLiau = words ? 0.0588 * L - 0.296 * S - 15.8 : 0; // Coleman & Liau 1975
    const ari = words ? 4.71 * div(alnum, words) + 0.5 * wps - 21.43 : 0; // Senter & Smith 1967

    const grades = [fleschKincaid, gunningFog, colemanLiau, ari];
    if (smogReliable) grades.push(smog); // short texts would drag the average toward an unreliable SMOG
    const averageGrade = words ? grades.reduce((a, b) => a + b, 0) / grades.length : 0;

    return {
      empty: words === 0,
      counts: {
        characters: text.length,
        letters,
        words,
        sentences: nSent,
        syllables,
        complexWords,
        hardSentences: sentences.filter((s) => s.level === 'hard').length,
        veryHardSentences: sentences.filter((s) => s.level === 'veryhard').length,
      },
      averages: { wordsPerSentence: wps, syllablesPerWord: spw },
      scores: { fleschReadingEase, fleschKincaid, gunningFog, smog, colemanLiau, ari, averageGrade },
      smogReliable,
      time: { readingSeconds: div(words, WPM_READ) * 60, speakingSeconds: div(words, WPM_SPEAK) * 60 },
      sentences,
      complex: complexRanges,
    };
  };

  // Flat, non-overlapping slices that cover the whole text: [{ text, sentence: 'ok'|'hard'|'veryhard', complex }].
  // The page escapes each slice's text itself, so no HTML is ever built here.
  const highlightSegments = (input, result) => {
    const text = String(input == null ? '' : input);
    const r = result || analyze(text);
    const cuts = new Set([0, text.length]);
    for (const s of r.sentences) { cuts.add(s.start); cuts.add(s.end); }
    for (const c of r.complex) { cuts.add(c.start); cuts.add(c.end); }
    const points = [...cuts].sort((a, b) => a - b);

    const segs = [];
    let si = 0, ci = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      while (si < r.sentences.length && r.sentences[si].end <= a) si++;
      while (ci < r.complex.length && r.complex[ci].end <= a) ci++;
      const inSentence = si < r.sentences.length && r.sentences[si].start <= a;
      const sentence = inSentence ? r.sentences[si].level : 'ok';
      const complex = ci < r.complex.length && r.complex[ci].start <= a;
      const prev = segs[segs.length - 1];
      if (prev && prev.sentence === sentence && prev.complex === complex) prev.text += text.slice(a, b);
      else segs.push({ text: text.slice(a, b), sentence, complex });
    }
    return segs;
  };

  root.BriskReadReadability = {
    WPM_READ,
    WPM_SPEAK,
    HARD_WORDS,
    VERY_HARD_WORDS,
    SMOG_MIN_SENTENCES,
    BANDS,
    bandFor,
    round,
    countSyllables,
    tokenizeWords,
    splitSentences,
    analyze,
    highlightSegments,
  };
})(globalThis);
