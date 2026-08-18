import { afterEach, describe, expect, it } from "vitest";
import { useThemeStore } from "../themeStore";

afterEach(() => {
  useThemeStore.getState().setMode("system");
});

describe("themeStore", () => {
  it("defaults to system mode", () => {
    expect(useThemeStore.getState().mode).toBe("system");
  });

  it("setMode('dark') adds the dark class to <html> and persists the choice", () => {
    useThemeStore.getState().setMode("dark");

    expect(useThemeStore.getState().mode).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("ardulens:theme")).toBe("dark");
  });

  it("setMode('light') removes the dark class and persists the choice", () => {
    useThemeStore.getState().setMode("dark");
    useThemeStore.getState().setMode("light");

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("ardulens:theme")).toBe("light");
  });

  it("setMode('system') resolves via the OS preference (stubbed to prefer light in tests)", () => {
    useThemeStore.getState().setMode("dark");
    useThemeStore.getState().setMode("system");

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("ardulens:theme")).toBe("system");
  });
});
