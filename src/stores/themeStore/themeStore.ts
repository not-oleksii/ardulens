import { create } from "zustand";

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

const STORAGE_KEY = "ardulens:theme";

function isThemeMode(value: string | null): value is ThemeMode {
  return (THEME_MODES as readonly string[]).includes(value ?? "");
}

function detectInitialMode(): ThemeMode {
  const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
  return isThemeMode(stored) ? stored : "system";
}

function systemPrefersDark(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
}

// The .dark class (see index.css) is the single source of truth Tailwind/CSS reads from -
// "system" just means "resolve to whichever concrete class the OS prefers right now" instead
// of storing an explicit choice.
function applyDomClass(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const isDark = mode === "dark" || (mode === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", isDark);
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: detectInitialMode(),
  setMode: (mode) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, mode);
    applyDomClass(mode);
    set({ mode });
  },
}));

// Apply immediately at module load (imported at the top of main.tsx, before the first paint)
// so there's no flash of the wrong theme, and keep the resolved class in sync with the OS
// while the user is on "system" mode.
applyDomClass(useThemeStore.getState().mode);
if (typeof matchMedia !== "undefined") {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (useThemeStore.getState().mode === "system") applyDomClass("system");
  });
}
