import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "../i18n/i18n";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});
