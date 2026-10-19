/* global BriskReadExt */
/**
 * Bionic reading on the live page: bolds the opening of every word in place.
 * Injected with lib/ext-core.js; running it again toggles it off. The file's
 * last expression (true = on) is what executeScript returns to the worker.
 * Original text nodes are kept, so turning it off restores the page exactly.
 */
(() => {
  if (window.__briskBionic) return window.__briskBionic.toggle();

  const { bionicHead } = BriskReadExt;
  const STYLE_ID = 'briskread-bionic-style';
  // Text we must never touch: code, form fields, editors, and our own overlay.
  const SKIP =
    'script,style,noscript,textarea,input,select,option,code,pre,kbd,samp,svg,math,canvas,iframe,[contenteditable=""],[contenteditable="true"],briskread-overlay,brisk-bionic';
  const originals = new Map(); // wrapper element -> original text node
  let on = false;
  let observer = null;
  let pending = null;

  function wrap(node) {
    const text = node.nodeValue;
    const frag = document.createDocumentFragment();
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s/.test(part) || !/[\p{L}\p{N}]/u.test(part)) {
        frag.append(part);
        continue;
      }
      const head = bionicHead(part);
      const b = document.createElement('brisk-b');
      b.textContent = part.slice(0, head);
      frag.append(b, part.slice(head));
    }
    const box = document.createElement('brisk-bionic');
    box.append(frag);
    node.replaceWith(box);
    originals.set(box, node);
  }

  function apply(rootNode) {
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!/[\p{L}\p{N}]/u.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        const parent = n.parentElement;
        if (!parent || parent.closest(SKIP)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(wrap);
  }

  // ponytail: re-scans whole added subtrees per animation frame; fine for feeds and SPAs,
  // switch to per-node batching if a page streams thousands of nodes per second.
  function watch() {
    const queue = new Set();
    observer = new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.isConnected && !n.closest?.('brisk-bionic')) queue.add(n);
      if (pending || !queue.size) return;
      pending = requestAnimationFrame(() => {
        pending = null;
        observer.disconnect();
        for (const n of queue) {
          if (!n.isConnected) continue;
          if (n.nodeType === Node.TEXT_NODE) {
            const parent = n.parentElement;
            if (parent && !parent.closest(SKIP) && /[\p{L}\p{N}]/u.test(n.nodeValue)) wrap(n);
          } else if (n.nodeType === Node.ELEMENT_NODE && !n.closest(SKIP)) {
            apply(n);
          }
        }
        queue.clear();
        observer.observe(document.body, { childList: true, subtree: true });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function enable() {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = 'brisk-bionic{display:inline}brisk-b{display:inline;font-weight:bolder}';
      (document.head || document.documentElement).append(style);
    }
    apply(document.body);
    watch();
    on = true;
  }

  function disable() {
    observer?.disconnect();
    if (pending) cancelAnimationFrame(pending);
    pending = null;
    for (const [box, original] of originals) if (box.isConnected) box.replaceWith(original);
    originals.clear();
    document.getElementById(STYLE_ID)?.remove();
    on = false;
  }

  window.__briskBionic = {
    toggle() {
      if (on) disable();
      else enable();
      return on;
    },
  };
  return window.__briskBionic.toggle();
})();
