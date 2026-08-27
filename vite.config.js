import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      // The trip app is read-mostly; pushing updates silently avoids a
      // "reload?" prompt nobody will read on a train platform.
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],

      manifest: {
        name: 'OLC Company Trip 2026',
        short_name: 'OLC Trip',
        description:
          'Itinerary, groups, gallery, weather and emergency reference for the Orangeleaf company trip to Japan, 22–26 October 2026.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        // Matches the icon background so the splash does not flash white.
        background_color: '#0A0A0C',
        theme_color: '#0A0A0C',
        categories: ['travel', 'utilities'],
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Any unknown route falls back to the shell — this is a SPA.
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Google Fonts stylesheet — small, changes rarely.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            // The font files themselves are immutable; keep them a year.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Weather. Network first so it refreshes when there is signal,
            // but a cached copy still renders the tab while roaming.
            urlPattern: /^https:\/\/(api|archive-api)\.open-meteo\.com\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'open-meteo',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      devOptions: { enabled: true, type: 'module' },
    }),
  ],
})
