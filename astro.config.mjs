import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { posts } from './src/data/posts.ts';

// Real per-post dates only. A build-time lastmod on every URL is ignored by Google,
// and changefreq/priority are ignored outright, so neither is emitted.
const postLastmod = Object.fromEntries(
  posts.map((p) => [`https://briskread.com/blog/${p.slug}`, p.dateModified]),
);

// https://astro.build/config
export default defineConfig({
  site: 'https://briskread.com',
  // One URL form, no trailing slash: drives sitemap URLs; vercel.json 308s "/x/" to "/x".
  trailingSlash: 'never',
  integrations: [
    sitemap({
      // Skip thin/private app surfaces so crawlers focus on public content
      filter: (page) =>
        !page.includes('/account') &&
        !page.includes('/404'),
      serialize(item) {
        const lastmod = postLastmod[item.url];
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
});
