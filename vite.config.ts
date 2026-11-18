import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { welcomeHtml } from './src/ui/welcome.ts';
import { csvGuideHtml } from './src/ui/csvGuide.ts';

/** Each page, and the text the build writes into it in place of its marker comment. */
const PAGES: Record<string, { marker: RegExp; html: () => string }> = {
  '/index.html': { marker: /<!-- welcome:[\s\S]*?-->/, html: welcomeHtml },
  '/paypal-csv.html': { marker: /<!-- csv-guide:[\s\S]*?-->/, html: csvGuideHtml },
};

export default defineConfig({
  plugins: [
    {
      // Writes each page's words into its HTML file as plain HTML, so search
      // engines see real text without running JavaScript. On the main page the
      // app replaces it on load. Runs first ("pre"), so Vite then gives the
      // guide's screenshots their final addresses like any other image.
      name: 'page-html',
      transformIndexHtml: {
        order: 'pre',
        handler(html, ctx) {
          const page = PAGES[ctx.path];
          if (!page) return html;
          if (!page.marker.test(html)) throw new Error(`${ctx.path} is missing its marker comment`);
          return html.replace(page.marker, page.html());
        },
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        'paypal-csv': resolve(import.meta.dirname, 'paypal-csv.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
