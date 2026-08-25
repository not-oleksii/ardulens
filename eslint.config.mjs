import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config({
  ignores: [
    "**/dist/**",
    "coverage/**",
    "app/src-tauri/target/**",
    "app/public/cesium/**",
    // Storybook story/doc/config files aren't covered by tsconfig.app.json (see its own
    // comment) and aren't part of the shipped app - typed linting (projectService) falling
    // back to an ad-hoc single-file program per file here was reproducibly triggering a real
    // V8 Zone allocator OOM on this memory-constrained machine (same failure class as
    // feedback_vite_cesium_dev_oom), not a lint finding worth that cost. Storybook's own
    // toolchain (not eslint) is what actually needs these files to be valid.
    ".storybook/**",
    "src/**/*.stories.tsx",
  ],
}, js.configs.recommended, {
  files: ["src/**/*.{ts,tsx}"],
  extends: [...tseslint.configs.recommendedTypeChecked],
  plugins: {
    "react-hooks": reactHooks,
    "react-refresh": reactRefresh,
  },
  languageOptions: {
    ecmaVersion: 2023,
    globals: globals.browser,
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    ...reactHooks.configs.flat["recommended-latest"].rules,
    ...reactRefresh.configs.vite.rules,
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
}, {
  files: ["**/*.test.ts", "**/*.test.tsx", "src/test/**"],
  languageOptions: { globals: { ...globals.browser, ...globals.node } },
  rules: {
    "@typescript-eslint/no-non-null-assertion": "off",
  },
}, {
  // shadcn/ui primitives (vendored, not hand-authored) routinely co-export a
  // cva() variants function next to the component, which this rule doesn't
  // recognize as a Fast-Refresh-safe constant. See AGENTS.md's ui/ exception.
  files: ["src/components/ui/**"],
  rules: {
    "react-refresh/only-export-components": "off",
  },
}, {
  files: ["vite.config.ts", "vitest.config.ts", "eslint.config.mjs"],
  languageOptions: { globals: globals.node },
});
