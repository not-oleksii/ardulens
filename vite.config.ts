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
  // `cesium`'s own package.json points its ESM entry at Source/Cesium.js, a single aggregator
  // re-exporting ~1600+ individual Core/Scene/DataSources modules - Vite's dev-server dependency
  // scanner has to fully walk that whole fan-out to pre-bundle it, which is expensive enough to
  // blow past V8's Zone allocator on memory-constrained machines, crashing `vite`/`tauri dev`
  // outright with "FATAL ERROR: Zone Allocation failed - process out of memory" during the
  // "scanning dependencies" phase - reproduced directly (twice, including once even with
  // --max-old-space-size=8192, confirming it's the separate Zone allocator, not the general
  // heap, so raising heap size alone doesn't help).
  //
  // Excluding cesium sidesteps the scan (it's served as native ESM instead), but then esbuild's
  // CJS-interop wrapping no longer runs for anything reached only through Cesium's OWN internal
  // imports either - every one of its transitive dependencies below is genuinely CommonJS-only
  // (`module.exports = ...`, confirmed via each package's own package.json/entry file, not
  // guessed), so each needs to stay explicitly included or the browser fails outright with
  // "does not provide an export named 'default'" the moment Cesium touches it.
  optimizeDeps: {
    exclude: ['cesium'],
    include: [
      '@spz-loader/core',
      '@tweenjs/tween.js',
      '@zip.js/zip.js',
      'autolinker',
      'bitmap-sdf',
      'dompurify',
      'draco3d',
      'grapheme-splitter',
      'jsep',
      'kdbush',
      'ktx-parse',
      'lerc',
      'mersenne-twister',
      'nosleep.js',
      'pako',
      'protobufjs',
      'topojson-client',
      'urijs',
    ],
  },
  publicDir: 'app/public',
  server: {
    // Only auto-open a browser tab for a plain `npm run dev` - when Vite is started as
    // Tauri's own beforeDevCommand (run-desktop.bat -> `npm run tauri dev`), the desktop
    // window is the app; TAURI_ENV_PLATFORM (among others) is only set in that case,
    // confirmed by comparing `npm run dev`'s env against `npm run tauri dev`'s - so this
    // is what stops a browser tab from also opening alongside the Tauri window.
    open: process.env.TAURI_ENV_PLATFORM ? false : '/app/',
    // Without this, Vite silently falls back to the next free port when 5173 is taken,
    // but tauri.conf.json's devUrl is hardcoded to 5173 - so Tauri just hangs forever
    // waiting for a server that's actually listening on the wrong port. Failing fast
    // here turns that into an immediate, legible error instead.
    strictPort: true,
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
