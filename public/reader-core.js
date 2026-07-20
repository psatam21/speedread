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

  root.SpeedReadReaderCore = {
    getOrpIndex,
    getPhraseParts,
    getFlowContext,
    clampReaderIndex,
    getPlaybackStart,
  };
})(globalThis);
