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

- [Node.js](https://nodejs.org) 20 or later

## Running the app

The easiest way: double-click the launcher for your OS. It installs dependencies on
first run, builds the app, and opens it in your browser automatically.

- Windows: `run.bat`
- macOS/Linux: `run.sh` (`./run.sh`)

Or run it manually:

```bash
npm install
npm run start
```

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

## Project structure

See [AGENTS.md](AGENTS.md) for a full breakdown of the folder layout, naming
conventions, and the contribution workflow (branch naming, PR format).

## License

No license has been set for this project yet.
