import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
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
