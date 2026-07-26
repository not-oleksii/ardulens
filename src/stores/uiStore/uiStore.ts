import { create } from "zustand";
import type { UiState } from "./types";

export const TABS = ["dashboard", "graphs", "parameters", "advisor", "compare"] as const;
export type Tab = (typeof TABS)[number];

export const useUiStore = create<UiState>((set) => ({
  activeTab: "dashboard",
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
