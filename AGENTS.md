# Contributing (humans and AI agents)

This file is the guide for anyone changing this codebase — human contributors and AI
coding agents alike. Read it before opening a PR.

## Project structure

```
ardulens/
├── legacy/            # the original pre-React app, kept for reference - do not extend
├── app/                # the runnable shell
│   ├── index.html      # entry point loaded by the dev server / build
│   ├── public/         # static assets copied as-is (favicon, icons)
│   └── src-tauri/       # the Tauri (Rust) desktop wrapper
└── src/                # all React/TypeScript source
    ├── builders/        # test-data builders (fluent classes for constructing mock complex objects)
    ├── pages/           # top-level views, one per app tab (Dashboard, Graphs, Parameters, Advisor, Compare)
    ├── components/       # shared/reusable UI components
    ├── stores/          # Zustand stores (UI state)
    ├── services/         # thin wrappers around browser/worker APIs
    ├── workers/          # Web Worker entry points
    ├── parsers/          # log-file format parsers (.bin / .skylog)
    ├── analysis/         # flight metrics + advisor logic
    ├── parameters/        # .param / PARM parameter extraction
    ├── utils/            # small, pure helper functions (formatting, geo math, sample helpers)
    ├── types.ts          # shared cross-cutting types (Flight, Sample, ParseResult, ...)
    └── constants.ts       # shared constants
```

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
