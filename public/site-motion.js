/**
 * BriskRead site motion — lightweight, no deps.
 * Scroll progress, reveal, cursor glow, product tilt, magnetic CTA.
 * All no-ops under prefers-reduced-motion.
 */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  document.documentElement.classList.add('is-ready');
  if (finePointer) document.documentElement.classList.add('has-pointer');

  /* ── Scroll progress + header state ── */
  const progress = document.querySelector('.scroll-progress');
  const onScroll = () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const p = max > 0 ? (window.scrollY / max) * 100 : 0;
    if (progress) progress.style.width = p.toFixed(2) + '%';
    document.documentElement.classList.toggle('is-scrolled', window.scrollY > 12);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  if (reduce) return;

  /* ── Intersection reveals ── */
  const motionNodes = document.querySelectorAll('[data-motion], [data-stagger]');
  if (motionNodes.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          if (el.hasAttribute('data-stagger')) {
            [...el.children].forEach((child, i) => {
              child.style.setProperty('--i', String(i));
            });
          }
          el.classList.add('is-inview');
          io.unobserve(el);
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 }
    );
    motionNodes.forEach((el) => {
      const top = el.getBoundingClientRect().top;
      if (top < window.innerHeight * 0.9) {
        if (el.hasAttribute('data-stagger')) {
          [...el.children].forEach((child, i) => child.style.setProperty('--i', String(i)));
        }
        el.classList.add('is-inview');
      } else {
        io.observe(el);
      }
    });
  }

  /* ── Adaptive cursor glow (surface-aware colour) ── */
  const glow = document.querySelector('.cursor-glow');
  if (glow && finePointer) {
    let gx = window.innerWidth / 2;
    let gy = window.innerHeight / 2;
    let tx = gx;
    let ty = gy;
    let on = false;
    let surface = 'light';
    let sampleX = gx;
    let sampleY = gy;

    const parseRGBA = (str) => {
      if (!str || str === 'transparent') return null;
      const m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
      if (!m) return null;
      return {
        r: Number(m[1]),
        g: Number(m[2]),
        b: Number(m[3]),
        a: m[4] === undefined ? 1 : Number(m[4]),
      };
    };

    const luminance = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;

    const isAccentColor = (c) => {
      // Brand purples / saturated accents
      const max = Math.max(c.r, c.g, c.b);
      const min = Math.min(c.r, c.g, c.b);
      if (max < 40) return false;
      const sat = max === 0 ? 0 : (max - min) / max;
      // bluish-purple bias
      return sat > 0.25 && c.b > c.g && c.b > 80 && c.r > 40 && c.r < 200;
    };

    const sampleSurface = (x, y) => {
      // elementsFromPoint skips pointer-events:none (the glow itself)
      let stack;
      try {
        stack = document.elementsFromPoint(x, y);
      } catch {
        return surface;
      }
      for (let i = 0; i < stack.length; i++) {
        const el = stack[i];
        if (!el || el === glow || (el.classList && el.classList.contains('cursor-glow'))) continue;
        if (el.closest && el.closest('.cursor-glow')) continue;

        const tag = el.tagName;
        if (tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS') return 'dark';

        const cs = getComputedStyle(el);
        // Explicit dark product chrome
        if (
          el.classList &&
          (el.classList.contains('hero-reader') ||
            el.classList.contains('hero-reader-shell') ||
            el.classList.contains('launch-strip') ||
            el.classList.contains('brand-drench'))
        ) {
          return 'dark';
        }

        const bg = parseRGBA(cs.backgroundColor);
        if (bg && bg.a >= 0.5) {
          if (isAccentColor(bg)) return 'accent';
          return luminance(bg) < 0.45 ? 'dark' : 'light';
        }

        // Gradient / image backgrounds often report transparent — check bg-image
        const bi = cs.backgroundImage;
        if (bi && bi !== 'none' && !bi.includes('gradient(0') ) {
          // solid-looking painted surfaces (cards with gradients, hero mock)
          if (bi.includes('gradient') || bi.includes('url(')) {
            // dark mock / purple gradients lean dark or accent
            if (/#0|#1|rgb\(\s*([0-3]?\d)/.test(bi) || bi.includes('07') || bi.includes('black')) return 'dark';
          }
        }
      }

      // Fall through to page canvas
      const pageBg = parseRGBA(getComputedStyle(document.body).backgroundColor)
        || parseRGBA(getComputedStyle(document.documentElement).backgroundColor);
      if (pageBg && pageBg.a >= 0.5) {
        return luminance(pageBg) < 0.45 ? 'dark' : 'light';
      }
      const theme = document.documentElement.dataset.theme;
      return theme === 'dark' || theme === 'amoled' ? 'dark' : 'light';
    };

    const tick = () => {
      // Higher lerp = snappier follow
      gx += (tx - gx) * 0.28;
      gy += (ty - gy) * 0.28;
      glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // Sample surface a bit less often than pointermove for elegance + perf
    let sampleScheduled = false;
    const scheduleSample = () => {
      if (sampleScheduled) return;
      sampleScheduled = true;
      requestAnimationFrame(() => {
        sampleScheduled = false;
        const next = sampleSurface(sampleX, sampleY);
        if (next !== surface) {
          surface = next;
          glow.dataset.surface = surface;
        }
      });
    };

    window.addEventListener(
      'pointermove',
      (e) => {
        tx = e.clientX;
        ty = e.clientY;
        sampleX = e.clientX;
        sampleY = e.clientY;
        if (!on) {
          on = true;
          glow.classList.add('is-on');
        }
        scheduleSample();
      },
      { passive: true }
    );
    window.addEventListener(
      'pointerleave',
      () => {
        on = false;
        glow.classList.remove('is-on');
      },
      { passive: true }
    );
  }

  /* ── Product frame: settle float, then tilt on hover ── */
  const shell = document.querySelector('.hero-reader-shell');
  if (shell) {
    // is-entered locks opacity:1 forever — removing is-settled must never blank the mock
    window.setTimeout(() => {
      shell.classList.add('is-entered', 'is-settled');
    }, 1400);
    if (finePointer) {
      const stage = shell.closest('.hero-stage') || shell.parentElement;
      let hovering = false;
      stage.addEventListener(
        'pointermove',
        (e) => {
          hovering = true;
          shell.classList.add('is-entered', 'is-tilting');
          shell.classList.remove('is-settled');
          const r = shell.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          // Mild tilt only — keep fully visible
          shell.style.transform = `rotateY(${px * 6}deg) rotateX(${-py * 4}deg) translateY(-2px)`;
          shell.style.transition = 'transform 80ms linear';
          shell.style.opacity = '1';
        },
        { passive: true }
      );
      stage.addEventListener(
        'pointerleave',
        () => {
          hovering = false;
          shell.classList.remove('is-tilting');
          shell.style.transition = 'transform 400ms cubic-bezier(0.16,1,0.3,1)';
          shell.style.transform = '';
          shell.style.opacity = '1';
          window.setTimeout(() => {
            if (!hovering) {
              shell.classList.add('is-entered', 'is-settled');
            }
          }, 420);
        },
        { passive: true }
      );
    }
  }

  /* ── Magnetic primary buttons ── */
  if (finePointer) {
    document.querySelectorAll('.btn-primary, .nav-cta').forEach((btn) => {
      btn.addEventListener(
        'pointermove',
        (e) => {
          const r = btn.getBoundingClientRect();
          const x = e.clientX - r.left - r.width / 2;
          const y = e.clientY - r.top - r.height / 2;
          btn.style.transform = `translate(${x * 0.18}px, ${y * 0.22}px)`;
        },
        { passive: true }
      );
      btn.addEventListener(
        'pointerleave',
        () => {
          btn.style.transform = '';
        },
        { passive: true }
      );
    });
  }

  /* ── Import option tilt ── */
  if (finePointer) {
    document.querySelectorAll('.hero-import-option').forEach((card) => {
      card.addEventListener(
        'pointermove',
        (e) => {
          const r = card.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          card.style.transform = `perspective(600px) rotateY(${px * 6}deg) rotateX(${-py * 5}deg) translateY(-2px)`;
        },
        { passive: true }
      );
      card.addEventListener(
        'pointerleave',
        () => {
          card.style.transform = '';
        },
        { passive: true }
      );
    });
  }

})();
