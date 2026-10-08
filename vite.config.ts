import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Flor da Mata',
        short_name: 'Flor da Mata',
        description: 'Registro de campo e painel da fazenda Flor da Mata',
        lang: 'pt-BR',
        theme_color: '#2f5d3a',
        background_color: '#f4f1e8',
        display: 'standalone',
        start_url: './',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
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
