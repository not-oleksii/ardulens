# Contributing (humans and AI agents)

This file is the guide for anyone changing this codebase — human contributors and AI
coding agents alike. Read it before opening a PR.

ArduLens is an ArduPilot flight log viewer/analyzer/parameter explorer (`.bin` DataFlash
and `.skylog` files → a summarized flight table, advisories, parameters). See
[README.md](README.md) for the full pitch, tech stack, and how to run the app - this file
only covers conventions for changing the code.

## Project structure

```
ardulens/
├── app/                # the runnable shell
│   ├── index.html      # entry point loaded by the dev server / build
│   ├── public/         # static assets copied as-is (favicon, icons)
│   └── src-tauri/       # the Tauri (Rust) desktop wrapper
└── src/                # all React/TypeScript source
    ├── builders/        # test-data builders (fluent classes for constructing mock complex objects)
    ├── pages/           # top-level views: HomeView (the landing/upload screen, shown when no
    │                    #   file is loaded) plus one per app tab (Logs, Graphs, Map, Parameters,
    │                    #   Advisor, Compare - see stores/uiStore's VISIBLE_TABS: a page only
    │                    #   shows as a tab once it's real)
    ├── components/       # shared/reusable UI components
    │   └── ui/            # shadcn/ui primitives (Button, Tabs, Card, ...) - see exception below
    ├── lib/              # `utils.ts` re-exporting `cn` - see exception below
    ├── i18n/             # i18next setup + uk/en dictionaries
    ├── hooks/           # shared React hooks (e.g. useDerivedFromFile - lazily derive a page's
    │                    #   view-model from the shared loaded file)
    ├── stores/          # Zustand stores (fileStore holds the one shared loaded file; uiStore
    │                    #   holds UI state like the active tab)
    ├── services/         # thin wrappers around browser/worker APIs
    ├── workers/          # Web Worker entry points
    ├── parsers/          # log-file format parsers (.bin / .skylog)
    ├── analysis/         # flight metrics + advisor logic
    ├── parameters/        # .param / PARM parameter extraction
    ├── utils/            # small, pure helper functions (formatting, geo math, sample helpers, `cn`)
    ├── types.ts          # shared cross-cutting types (Flight, Sample, ParseResult, ...)
    └── constants.ts       # shared constants
```

### UI stack

Tailwind CSS v4 (CSS-first config, no `tailwind.config.*`) + shadcn/ui (Radix
primitives, copied into the repo rather than installed as a dependency) + Zustand for
UI state. Theme tokens (`--background`, `--primary`, `--border`, ...) live in
`src/index.css` under `:root` / `@media (prefers-color-scheme: dark)`, mapped to
Tailwind utilities via `@theme inline`. Change the look by editing those variables, not
by hand-rolling new CSS files.

To add a new primitive: `npx shadcn@latest add <component> --template vite --base radix`.
It will write to `src/components/ui/<name>.tsx` importing `cn` from `@/lib/utils` — that
import path is a deliberate exception to the folder convention below (see next section).

`app/src-tauri` is the desktop shell (Rust). You don't need Rust installed for normal
`src/` work - `npm run dev`/`test`/`build`/`lint` never touch it. Rust is only required
for `npm run tauri` (building/running the actual desktop binary).

### Folder convention exception: `src/components/ui/` and `src/lib/`

shadcn/ui's own CLI and every generated component hardcode `src/components/ui/<kebab-name>.tsx`
(flat, lowercase) and `import { cn } from "@/lib/utils"`. Fighting that would break `npx shadcn add`
and future updates, so those two paths are exempt from the PascalCase-folder-per-unit rule below.
`src/lib/utils.ts` is a one-line re-export; the real `cn` implementation and its tests live at
`src/utils/cn/cn.ts`, following this repo's own convention like everything else does.
`eslint.config.mjs` also turns off `react-refresh/only-export-components` for this folder,
since these files routinely co-export a `cva()` variants function next to the component.

### Folder convention

Every unit of code (a component, page, builder, or util) lives in its own folder named
after it, next to its tests and its types:

```
SomeName/
├── __tests__/
│   └── SomeName.test.ts(x)
├── types.ts       # only if the unit has its own types/interfaces worth naming
└── SomeName.ts(x)
```

- Components/pages/builders use `PascalCase` folder + file names (`TabBar/TabBar.tsx`).
- Utils/parsers/analysis/parameters use `kebab-case` (`dataflash-bin/dataflash-bin.ts`).
- Only add `types.ts` when there's real type/interface content to extract — don't create
  an empty one "just in case."
- Component props types belong in that component's `types.ts`, not inline in the
  component file.

### Translating UI text

Every user-visible string goes through i18next (`uk`/`en` in `src/i18n/locales/`), never
hardcoded in a component. Metric/column labels are the one non-obvious case: each entry
in `analysis/metrics/metrics.ts`'s `METRICS` array carries a `key` (e.g. `takeoffVoltage`),
and UI code resolves the label via `t(\`metrics.${metric.key}\`)` - add the same key to
*both* locale files' `"metrics"` block when adding a new metric. `Metric.h` is only a
Ukrainian fallback for non-UI code (tests, etc.) that doesn't go through i18next.

### Loading a file

A file is loaded exactly once, on `HomeView` (the screen shown when no file is loaded
yet) - not per-tab. `HomeView` does a quick validating parse, then stores `{name, buf}`
in the shared `useFileStore` (`src/stores/fileStore/`). `App.tsx` renders `HomeView`
while that store's `file` is `null`, and the Sidebar + tab views otherwise. Each tab page
(Logs/Graphs/Map) derives its own, potentially heavier view-model from that same shared
buffer lazily, the first time it's opened, via `useDerivedFromFile`
(`src/hooks/useDerivedFromFile/`) - don't add another per-page dropzone/file-input. The
Sidebar's "Change file" button just calls `useFileStore.getState().clearFile()`, which
sends the user back to `HomeView`.

### Testing with log data

Never commit or use a real `.bin`/`.skylog` file in this repo - flight logs can contain
GPS coordinates and other sensitive data. Use `FlightBinBuilder` and `SkylogFileBuilder`
(`src/builders/`) instead: fluent builders that produce synthetic-but-realistic buffers
(field names/format confirmed against real DataFlash FMT declarations and skylog
telemetry lines, values entirely made up). They're used both in tests and as the
in-app "Sample .bin/.skylog" buttons on the Home page.

Coverage thresholds (`vitest.config.ts`): 80% statements/functions/lines, 70% branches,
enforced by `npm run test:coverage`.

## Branch naming

`<type>/<short-description>`, kebab-case description:

- `feat/name-of-feature` — new functionality
- `fix/name-of-fix` — bug fix
- `docs/name-of-docs` — documentation only
- `nfr/name-of-non-func-req` — non-functional work: tests, refactors, tooling, perf,
  chores — anything that isn't user-facing feature/fix/docs

## Pull requests

**Title**: `<type>(<Scope>): <summary>`, where `<Scope>` is the component/module the
change is about (PascalCase, matching its folder name where applicable) and `<summary>`
is a short imperative sentence.

Examples:

- `feat(Button): Add button component`
- `fix(Button): User unable to click button`
- `nfr(Button): Add click button tests`
- `docs(Readme): Update file structure`

Types: `feat`, `fix`, `nfr`, `docs` (matching the branch-naming types above).

**Body**: use this template —

```
Changes:
- change 1
- change 2

Screenshots (optional):
```

## Before opening a PR

Run these from the repo root and make sure they all pass:

```bash
npm run lint
npm run test
npm run build
```
