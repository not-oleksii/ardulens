import { create } from "zustand";
import type { UiState } from "./types";

export const TABS = ["logs", "graphs", "parameters", "advisor", "compare"] as const;
export type Tab = (typeof TABS)[number];

/** Tabs with real functionality, shown in the tab bar. The rest stay hidden until built. */
export const VISIBLE_TABS: readonly Tab[] = ["logs", "graphs"];

export const useUiStore = create<UiState>((set) => ({
  activeTab: "logs",
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
