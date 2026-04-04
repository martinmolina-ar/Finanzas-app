import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.svg', 'icons/*.png'],
      manifest: {
        name: 'FinanzasApp',
        short_name: 'Finanzas',
        description: 'Tu app de finanzas personales',
        theme_color: '#000000',
        background_color: '#F5F5F7',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.dicebear\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'avatars-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 } },
          },
          {
            urlPattern: /^https:\/\/dolarapi\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'dolar-cache', expiration: { maxEntries: 5, maxAgeSeconds: 60 * 10 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
})
