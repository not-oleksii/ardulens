import { create } from "zustand";
import type { UiState } from "./types";

export const TABS = ["logs", "graphs", "map", "parameters", "advisor", "compare"] as const;
export type Tab = (typeof TABS)[number];

/** Tabs with real functionality, shown in the tab bar. The rest stay hidden until built. */
export const VISIBLE_TABS: readonly Tab[] = ["logs", "graphs", "map"];

export const useUiStore = create<UiState>((set) => ({
  activeTab: "logs",
  setActiveTab: (tab) => set({ activeTab: tab }),
  pendingPresetKey: null,
  setPendingPresetKey: (key) => set({ pendingPresetKey: key }),
}));
