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
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom implements none of the Pointer Events capture API - Radix's Select (and other
// pointer-driven Radix primitives) call hasPointerCapture/setPointerCapture/
// releasePointerCapture on the elements it interacts with, which throws under jsdom without
// these. Also no scrollIntoView, which Select calls when opening to bring the selected item
// into view. All are no-ops here since jsdom has no real layout/scrolling to act on anyway.
if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false;
}
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== "function") {
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
});
