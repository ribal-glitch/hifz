import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// Zwei Ziele:
//   npm run build           → installierbare Web-App für GitHub Pages (dist/)
//   npm run build:artifact  → Link-Version für claude.ai (dist-artifact/, danach scripts/make-artifact.mjs)
// Relative Pfade, damit die App unter https://NAME.github.io/REPO/ läuft.
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    base: './',
    define: { 'import.meta.env.VITE_TARGET': JSON.stringify(artifact ? 'artifact' : 'pwa') },
    resolve: artifact
      ? { alias: { 'virtual:pwa-register': fileURLToPath(new URL('./src/pwa-stub.ts', import.meta.url)) } }
      : undefined,
    build: artifact
      ? {
          outDir: 'dist-artifact',
          // Schriften direkt einbetten: in claude.ai dürfen nur eigene Daten nachgeladen werden
          assetsInlineLimit: () => true,
          cssCodeSplit: false,
        }
      : undefined,
    plugins: [
      react(),
      ...(artifact
        ? []
        : [
            VitePWA({
              registerType: 'autoUpdate',
              includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
              manifest: {
                name: 'Hifz – Quran auswendig',
                short_name: 'Hifz',
                description: 'Täglicher Begleiter für Hifz: Dars, frische Seiten und Murājaʿa.',
                lang: 'de',
                dir: 'ltr',
                display: 'standalone',
                orientation: 'portrait',
                start_url: './',
                scope: './',
                background_color: '#f3eee3',
                theme_color: '#f3eee3',
                icons: [
                  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
              },
              workbox: {
                // Alle Quran-Daten und die Schriften für den Offline-Betrieb vorab laden
                globPatterns: ['**/*.{js,css,html,svg,png,json,ttf,woff2}'],
                maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
                navigateFallback: 'index.html',
              },
            }),
          ]),
    ],
    test: {
      include: ['src/**/*.test.ts'],
    },
  };
});
