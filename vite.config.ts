import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['campora-icon.svg', 'push-handler.js'],
      manifest: {
        name: 'CAMPORA — Your Campus, Connected',
        short_name: 'CAMPORA',
        description: 'Your campus. Your community. Your world.',
        theme_color: '#0b0914',
        background_color: '#0b0914',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [{ src: '/campora-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,png,jpg,woff2}'],
        importScripts: ['push-handler.js'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
