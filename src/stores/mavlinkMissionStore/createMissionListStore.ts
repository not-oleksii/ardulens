import { create } from "zustand";
import type { MavlinkMissionState, MissionItemEntry } from "./types";

const INITIAL: Pick<
  MavlinkMissionState,
  "items" | "downloadPhase" | "downloadCountExpected" | "downloadError" | "uploadPhase" | "uploadError"
> = {
  items: [],
  downloadPhase: "idle",
  downloadCountExpected: null,
  downloadError: null,
  uploadPhase: "idle",
  uploadError: null,
};

/** Builds one MISSION_ITEM_INT-shaped list store - MISSION, FENCE, and RALLY all share this exact
 *  same state shape and MAVLink protocol, so a real vehicle can have one of each in flight at
 *  once (see mavlinkMissionStore.ts/mavlinkFenceStore.ts/mavlinkRallyStore.ts), not one store
 *  keyed by mission type - none of the three panels ever need to share or cross-read state. */
export function createMissionListStore() {
  return create<MavlinkMissionState>((set) => ({
    ...INITIAL,
    beginDownload: () => set({ items: [], downloadPhase: "active", downloadCountExpected: null, downloadError: null }),
    setDownloadCountExpected: (countExpected) => set({ downloadCountExpected: countExpected }),
    receiveDownloadedItem: (item: MissionItemEntry) =>
      set((s) => ({ items: [...s.items.filter((i) => i.seq !== item.seq), item].sort((a, b) => a.seq - b.seq) })),
    finishDownload: () => set({ downloadPhase: "done" }),
    failDownload: (error) => set({ downloadPhase: "error", downloadError: error }),
    setItems: (items) => set({ items }),
    startUpload: () => set({ uploadPhase: "active", uploadError: null }),
    finishUpload: () => set({ uploadPhase: "done" }),
    failUpload: (error) => set({ uploadPhase: "error", uploadError: error }),
    reset: () => set({ ...INITIAL }),
  }));
}
