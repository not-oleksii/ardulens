import type { Tab } from "./uiStore";

export interface UiState {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}
