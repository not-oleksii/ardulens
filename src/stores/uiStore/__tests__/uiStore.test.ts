import { describe, expect, it } from "vitest";
import { TABS, VISIBLE_TABS, useUiStore } from "../uiStore";

describe("uiStore", () => {
  it("defaults to the logs tab", () => {
    expect(useUiStore.getState().activeTab).toBe("logs");
  });

  it("switches the active tab", () => {
    useUiStore.getState().setActiveTab("graphs");
    expect(useUiStore.getState().activeTab).toBe("graphs");
    useUiStore.getState().setActiveTab("logs"); // reset for other tests
  });

  it("declares every tab exactly once", () => {
    expect(new Set(TABS).size).toBe(TABS.length);
  });

  it("only exposes tabs with real functionality as visible", () => {
    expect(VISIBLE_TABS).toEqual(["logs", "graphs"]);
    for (const tab of VISIBLE_TABS) expect(TABS).toContain(tab);
  });
});
