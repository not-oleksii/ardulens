import type { Decorator, Preview } from "@storybook/react-vite";
import React, { useEffect } from "react";
import "../src/index.css";

// Mirrors themeStore.ts's real applyDomClass() behavior (a .dark class on the root, not a
// media query) so stories reflect exactly what the app itself renders in each theme.
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme as string;
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return (
    <div style={{ background: "var(--background)", color: "var(--foreground)", minHeight: "100vh", padding: 24 }}>
      <Story />
    </div>
  );
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: "todo",
    },
    backgrounds: { disable: true }, // the theme decorator's own var(--background) already handles this
  },
  globalTypes: {
    theme: {
      description: "ArduLens light/dark token set",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", icon: "sun", title: "Light" },
          { value: "dark", icon: "moon", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "light",
  },
  decorators: [withTheme],
};

export default preview;
