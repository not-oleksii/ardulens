import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // CesiumJS locates its static assets (copied into public/cesium/ by
  // scripts/copy-cesium-assets.mjs) via this global - see Cesium's own Vite guide.
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  publicDir: 'app/public',
  server: {
    open: '/app/',
  },
  build: {
    outDir: 'app/dist',
    rollupOptions: {
      input: 'app/index.html',
    },
  },
})
