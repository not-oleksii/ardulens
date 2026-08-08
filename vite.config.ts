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
    watch: {
      // app/src-tauri/target is Cargo's build output. Vite has no reason to
      // watch it, and doing so races Cargo's file writes on Windows, where
      // locked files raise EBUSY (see Tauri's own Vite template config).
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    outDir: 'app/dist',
    rollupOptions: {
      input: 'app/index.html',
    },
  },
})
