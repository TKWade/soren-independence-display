import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { validateBrowserConfig } from './scripts/validate-browser-config.mjs'
export default defineConfig(({ mode }) => {
 const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
 validateBrowserConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
 return {
  build: { rolldownOptions: { output: { codeSplitting: { groups: [
    { name: 'supabase', test: /node_modules[\\/]@supabase/ },
    { name: 'timezone', test: /node_modules[\\/](@js-temporal|jsbi)/ },
  ] } } } },
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'autoUpdate',
    injectRegister: 'script',
    includeAssets: ['favicon.svg', 'icons/*.png'],
    manifest: {
      name: 'Soren’s Calendar',
      short_name: 'My Week',
      description: 'An image-first weekly independence calendar for Soren.',
      theme_color: '#4d745b',
      background_color: '#f7f5ee',
      display: 'standalone',
      orientation: 'landscape',
      start_url: '/',
      scope: '/',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], navigateFallback: 'index.html' },
  })],
 }
})
