import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './i18n/i18n'
import './stores/themeStore/themeStore'
import './index.css'
import App from './App.tsx'

// The dev server (npm run dev, and Tauri's devUrl which points at that same server)
// serves index.html from its on-disk path, app/index.html - so the app boots at /app/ in
// dev. The production build gets index.html flattened to the root of the output directory
// by scripts/flatten-dist.mjs (Tauri requires it there), so it boots at / instead. Without
// this, BrowserRouter's routes never match the dev-mode /app/ path and nothing renders.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.DEV ? '/app' : undefined}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
