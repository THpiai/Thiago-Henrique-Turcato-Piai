import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo-piai.png'],
      manifest: {
        name: 'PIAI – Fazenda Controle Total',
        short_name: 'PIAI',
        description: 'Registro de campo e painel da fazenda Flor da Mata',
        lang: 'pt-BR',
        theme_color: '#3f5233',
        background_color: '#f4f1e8',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /tile\.openstreetmap\.org|arcgisonline\.com/,
            handler: 'CacheFirst',
            options: { cacheName: 'mapa', expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 90 } },
          },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
})
