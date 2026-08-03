/* Copied verbatim from public/reader-core.js — keep the two in sync. */
(function (root) {
  const getOrpIndex = (word) => {
    const len = word.length;
    if (len <= 1) return 0;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    if (len <= 13) return 3;
    return 4;
  };

  const getPhraseParts = (words, index) => {
    const word = words[index] || '';
    const orpIndex = getOrpIndex(word);
    const before = words[index - 1] ? `${words[index - 1]} ` : '';
    const after = words[index + 1] ? ` ${words[index + 1]}` : '';
    return {
      left: before + word.slice(0, orpIndex),
      orp: word.charAt(orpIndex),
      right: word.slice(orpIndex + 1) + after,
    };
  };

  const getFlowContext = (words, index) => ({
    previous: words.slice(Math.max(0, index - 18), Math.max(0, index - 8)).join(' '),
    left: words.slice(Math.max(0, index - 8), index).join(' '),
    word: words[index] || '',
    right: words.slice(index + 1, index + 9).join(' '),
    next: words.slice(index + 9, index + 19).join(' '),
  });

  const clampReaderIndex = (index, length) => {
    if (length <= 0) return 0;
    return Math.max(0, Math.min(length - 1, index));
  };

  const getPlaybackStart = (index, length) => {
    if (length <= 0 || index >= length - 1) return 0;
    return clampReaderIndex(index, length);
  };

  const getIndexFromPercent = (percent, length) => (
    clampReaderIndex(Math.round((percent / 100) * Math.max(0, length - 1)), length)
  );

  // Chrome kills a single long utterance after ~15s, and remote voices fail sooner,
  // so speech has to be queued in short pieces. Splits on sentence ends where possible,
  // else on a space. Each chunk carries its absolute offset in the source string so
  // onboundary charIndex can still be mapped back to a word.
  const chunkForTTS = (text, baseOffset = 0, maxLen = 180) => {
    const chunks = [];
    let pos = 0;
    while (pos < text.length) {
      while (pos < text.length && /\s/.test(text[pos])) pos += 1;
      if (pos >= text.length) break;

      if (text.length - pos <= maxLen) {
        chunks.push({ text: text.slice(pos), offset: baseOffset + pos });
        break;
      }

      const slice = text.slice(pos, pos + maxLen);
      const sentenceEnd = Math.max(
        slice.lastIndexOf('. '), slice.lastIndexOf('! '),
        slice.lastIndexOf('? '), slice.lastIndexOf('\n')
      );
      // Only honour a sentence break if it isn't so early that chunks get tiny.
      let cut = sentenceEnd > maxLen * 0.4 ? sentenceEnd + 1 : slice.lastIndexOf(' ');
      if (cut <= 0) cut = maxLen; // ponytail: unbroken run longer than maxLen, hard split

      chunks.push({ text: text.slice(pos, pos + cut), offset: baseOffset + pos });
      pos += cut;
    }
    return chunks;
  };

  root.BriskReadReaderCore = {
    getOrpIndex,
    getPhraseParts,
    getFlowContext,
    clampReaderIndex,
    getPlaybackStart,
    getIndexFromPercent,
    chunkForTTS,
  };
})(globalThis);
