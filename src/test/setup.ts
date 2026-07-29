import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "../i18n/i18n";
import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver - stub it so components that observe their own
// container (e.g. TimelineChart) don't crash in tests.
if (typeof ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
}

// jsdom has no window.matchMedia - uPlot reads it at module-load time (to pick
// a device pixel ratio), so just importing it crashes without this stub.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

afterEach(() => {
  cleanup();
});
