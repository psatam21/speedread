// Single source of truth for blog posts. BlogPost.astro and blog/index.astro both read this.
// title has no " | BriskRead" suffix (BlogPost adds it). Dates are ISO YYYY-MM-DD.
export interface Post {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified: string;
  /** On-page <h1>. */
  h1: string;
  /** Small label above the h1. */
  label: string;
  /** Last item of the breadcrumb. */
  crumb: string;
  /** One-line card text on /blog. */
  blurb: string;
}

export const posts: Post[] = [
  {
    slug: 'free-online-speed-reader',
    title: 'Free Online Speed Reader, No Signup',
    description:
      'A free online speed reader that needs no account. Paste text or open a PDF, read with RSVP, Focus or Bionic, and add Audio Sync if you like.',
    datePublished: '2026-08-05',
    dateModified: '2026-10-19',
    h1: 'Free online speed reader (no signup required)',
    label: 'Quick answer',
    crumb: 'Free online speed reader',
    blurb: 'Paste or open a PDF in the browser, RSVP + Audio Sync — every feature free, no signup.',
  },
  {
    slug: 'free-speechify-alternatives',
    title: 'Free Speechify Alternatives (2026)',
    description:
      'Compare free Speechify alternatives: listen-first TTS apps vs a browser speed reader that syncs speech to RSVP. Local PDFs, no subscription.',
    datePublished: '2026-08-05',
    dateModified: '2026-10-19',
    h1: 'Free Speechify alternatives in 2026',
    label: 'Comparisons',
    crumb: 'Free Speechify alternatives',
    blurb: 'Listen-first apps vs dual-channel speed readers — when BriskRead is the better free fit.',
  },
  {
    slug: 'best-online-speed-readers',
    title: 'Best Online Speed Readers in 2026, Compared',
    description:
      'A practical guide to the best online speed reading websites: RSVP vs full-page tools, privacy, PDF support, Audio Sync, and how to choose without hype.',
    datePublished: '2026-08-04',
    dateModified: '2026-10-19',
    h1: 'Best online speed readers in 2026',
    label: 'Comparisons',
    crumb: 'Best online speed readers',
    blurb: 'What to look for, common trade-offs, and where BriskRead fits if you want Audio Sync plus local files.',
  },
  {
    slug: 'how-to-speed-read-online',
    title: 'How to Speed Read Online: A 6-Step Setup',
    description:
      'Step-by-step online speed reading: import text or PDF, choose Flash or Focus, use Audio Sync, set a realistic WPM, and protect comprehension.',
    datePublished: '2026-08-04',
    dateModified: '2026-10-19',
    h1: 'How to speed read online (a setup that holds up)',
    label: 'Practice',
    crumb: 'How to speed read online',
    blurb: 'A practical setup: import, pick a mode, pair audio, and check retention on hard material.',
  },
  {
    slug: 'rsvp-reading-explained',
    title: 'What Is RSVP Reading? A Plain Guide',
    description:
      'RSVP (rapid serial visual presentation) shows words one at a time at a fixed spot. Learn how it works, where the research says it fails, and how to use it.',
    datePublished: '2026-08-04',
    dateModified: '2026-10-19',
    h1: 'What is RSVP reading?',
    label: 'Concepts',
    crumb: 'RSVP reading explained',
    blurb: 'Rapid Serial Visual Presentation explained in plain language — when it helps and when to slow down.',
  },
  {
    slug: 'speed-read-pdf-online',
    title: 'How to Speed Read a PDF Online, Privately',
    description:
      'Speed read PDFs and EPUBs in the browser: upload locally, use RSVP or Focus, OCR for scans, and keep files private. Free PDF speed reading with BriskRead.',
    datePublished: '2026-08-04',
    dateModified: '2026-10-19',
    h1: 'How to speed read a PDF online',
    label: 'Workflows',
    crumb: 'Speed read a PDF online',
    blurb: 'PDF and EPUB workflows that stay private in the browser, plus when OCR is required.',
  },
  {
    slug: 'audio-sync-speed-reading',
    title: 'Speed Reading With Audio: Does It Work?',
    description:
      'Does listening while you read help? What research says about pairing RSVP with speech, and how to set a sustainable pace in a free browser reader.',
    datePublished: '2026-08-04',
    dateModified: '2026-10-19',
    h1: 'Speed reading with audio: does it work?',
    label: 'Research',
    crumb: 'Speed reading with audio',
    blurb: 'Eyes and ears on the same stream: what research says about pairing RSVP with speech, and when it is worth using.',
  },
];

export function getPost(slug: string): Post {
  const post = posts.find((p) => p.slug === slug);
  if (!post) throw new Error(`Unknown blog post slug: ${slug}`);
  return post;
}
