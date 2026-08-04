import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://briskread.com',
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      // Skip thin/private app surfaces so crawlers focus on public content
      filter: (page) =>
        !page.includes('/account') &&
        !page.includes('/404'),
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
      serialize(item) {
        // Homepage + guides matter more for discovery
        if (item.url === 'https://briskread.com/' || item.url === 'https://briskread.com') {
          return { ...item, priority: 1.0, changefreq: 'daily' };
        }
        if (item.url.includes('/blog')) {
          return { ...item, priority: 0.85, changefreq: 'weekly' };
        }
        if (
          item.url.includes('/rsvp-reader') ||
          item.url.includes('/bionic-reading') ||
          item.url.includes('/pdf-to-speech') ||
          item.url.includes('/how-it-works') ||
          item.url.includes('/extension')
        ) {
          return { ...item, priority: 0.9, changefreq: 'weekly' };
        }
        return item;
      },
    }),
  ],
});
