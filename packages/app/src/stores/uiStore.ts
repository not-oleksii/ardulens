import { create } from "zustand";

export const TABS = ["dashboard", "graphs", "parameters", "advisor", "compare"] as const;
export type Tab = (typeof TABS)[number];

interface UiState {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: "dashboard",
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
