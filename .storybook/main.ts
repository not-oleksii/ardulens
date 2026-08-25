import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

// Storybook here is a documentation/catalog tool only (design tokens, components) - it
// deliberately does NOT wire up @storybook/addon-vitest's interaction-testing integration,
// which would fold a second, browser-dependent Vitest project into the main `npm test`
// pipeline (needing real downloaded Chromium binaries just to run the existing fast, jsdom-only
// unit suite). Real end-to-end flow coverage is a separate Playwright suite (see
// [[project_ui_ux_modernization]]), not Storybook interaction tests.
const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  framework: "@storybook/react-vite",
  viteFinal: async (viteConfig) => {
    viteConfig.plugins ??= [];
    viteConfig.plugins.push(tailwindcss());
    viteConfig.resolve ??= {};
    viteConfig.resolve.alias = {
      ...viteConfig.resolve.alias,
      "@": path.resolve(import.meta.dirname, "../src"),
    };
    return viteConfig;
  },
};
export default config;
