import type { Tab } from "./uiStore";

export interface UiState {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  /** A Graphs preset key (see raw-log/presets.ts) to auto-apply next time GraphsView mounts,
   *  and clear - the mechanism behind PID Tune's "View in Graphs" deep-link (cross-page,
   *  since ArduPilot Setup and the log-viewer routes don't share any other UI state). */
  pendingPresetKey: string | null;
  setPendingPresetKey: (key: string | null) => void;
}
