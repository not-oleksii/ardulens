import { describe, expect, it } from "vitest";
import { TABS, useUiStore } from "./uiStore";

describe("uiStore", () => {
  it("defaults to the dashboard tab", () => {
    expect(useUiStore.getState().activeTab).toBe("dashboard");
  });

  it("switches the active tab", () => {
    useUiStore.getState().setActiveTab("graphs");
    expect(useUiStore.getState().activeTab).toBe("graphs");
    useUiStore.getState().setActiveTab("dashboard"); // reset for other tests
  });

  it("declares every tab exactly once", () => {
    expect(new Set(TABS).size).toBe(TABS.length);
  });
});
