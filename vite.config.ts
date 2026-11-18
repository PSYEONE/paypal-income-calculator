import { defineConfig } from 'vitest/config';
import { welcomeHtml } from './src/ui/welcome.ts';

export default defineConfig({
  plugins: [
    {
      // Writes the welcome page into index.html as plain HTML, so search engines
      // see real text without running JavaScript. The app replaces it on load.
      name: 'welcome-html',
      transformIndexHtml(html, ctx) {
        if (ctx.path !== '/index.html') return html;
        const marker = /<!-- welcome:[\s\S]*?-->/;
        if (!marker.test(html)) throw new Error('index.html is missing the <!-- welcome: --> marker');
        return html.replace(marker, welcomeHtml());
      },
    },
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
