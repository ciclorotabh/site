// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Site estático. Os endereços terminam em "/" como no WordPress antigo (/artigo/<slug>/).
export default defineConfig({
  site: 'https://ciclorotabh.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin/'),
    }),
  ],
});
