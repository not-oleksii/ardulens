# ArduLens

ArduLens is an ArduPilot flight log viewer, analyzer, and parameter explorer. Drop in a
`.bin` (DataFlash) or `.skylog` file to get a summarized flight table, graphs, automated
flight-health advisories (voltage sag, GPS integrity, low landing voltage), and a
parameter (`.param`/PARM) explorer — as a desktop app (via [Tauri](https://tauri.app)) or
in the browser.

## Tech stack

- React 19 + TypeScript, built with [Vite](https://vite.dev)
- [Tauri v2](https://tauri.app) for the desktop shell
- [Vitest](https://vitest.dev) + Testing Library for tests
- [Zustand](https://github.com/pmndrs/zustand) for UI state
- A Web Worker (via [Comlink](https://github.com/GoogleChromeLabs/comlink)) for off-main-thread log parsing/analysis

## Prerequisites

- **Browser build**: [Node.js](https://nodejs.org) 20 or later.
- **Desktop app**: also needs [Rust](https://rustup.rs) and, on Windows, the MSVC C++
  Build Tools. You don't need to install these yourself - `run-desktop.bat`/
  `run-desktop.sh` install whatever's missing automatically (via `winget` on Windows,
  Homebrew on macOS, or your distro's package manager on Linux) - no need to visit any
  website. The one exception is Node.js itself if none of those package managers are
  available; in that rare case the script tells you exactly what's missing.

## Running the app

There are two ways to run ArduLens, and which one you need depends on what you're doing:

- **Browser build** - the offline log viewer/analyzer (Logs/Graphs/Map). Double-click the
  launcher for your OS; it installs dependencies on first run, builds the app, and opens it
  in your browser automatically. **ArduPilot Setup**'s live vehicle connection (USB/Serial
  or UDP) is hidden in this build - a plain browser tab has no OS-level serial or raw-socket
  access, so it wouldn't work anyway; Dev Mode's simulated vehicle is still available.
  - Windows: `run-web.bat`
  - macOS/Linux: `run-web.sh` (`./run-web.sh`)
  - Or manually: `npm install && npm run start`
- **Desktop app** - required for **ArduPilot Setup**'s live vehicle connection (USB/serial
  or UDP). Use this instead:
  - Windows: `run-desktop.bat` - installs Node.js/Rust/C++ Build Tools automatically if
    missing (via `winget`); the C++ Build Tools step is a multi-GB download on a clean
    machine and may show a Windows permission (UAC) prompt - accept it to continue.
  - macOS/Linux: `run-desktop.sh` (`./run-desktop.sh`) - best-effort auto-install via
    Homebrew (macOS) or apt/dnf/pacman (Linux); falls back to a manual-install message if
    none of those are available.
  - Or manually: `npm install && npm run tauri dev` (after installing Node.js + Rust yourself)
- **Design system** - a Storybook catalog of ArduLens's design tokens (color/type/motion) and
  UI components, for design/UX work independent of the app itself.
  - Windows: `run-storybook.bat`
  - Or manually: `npm install && npm run storybook` - opens `http://localhost:6006`

## Available scripts

| Script                  | What it does                                              |
| ----------------------- | ---------------------------------------------------------- |
| `npm run dev`           | Starts the Vite dev server (visit `http://localhost:5173/app/`) |
| `npm run build`         | Type-checks and builds the production bundle into `app/dist` |
| `npm run preview`       | Serves an already-built `app/dist`                          |
| `npm run start`         | Builds, then serves + opens the app in your browser         |
| `npm run test`          | Runs the test suite once                                    |
| `npm run test:watch`    | Runs tests in watch mode                                    |
| `npm run test:coverage` | Runs tests with coverage                                    |
| `npm run lint`          | Lints the codebase                                          |
| `npm run tauri`         | Runs a Tauri CLI command (e.g. `npm run tauri dev`) for the desktop build |
| `npm run storybook`     | Starts the design system catalog (`http://localhost:6006`)  |
| `npm run build-storybook` | Builds a static, deployable copy of the Storybook catalog |

## Project structure

See [AGENTS.md](AGENTS.md) for a full breakdown of the folder layout, naming
conventions, and the contribution workflow (branch naming, PR format).

## License

No license has been set for this project yet.
