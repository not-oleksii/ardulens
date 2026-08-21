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

export const useMavlinkMissionStore = create<MavlinkMissionState>((set) => ({
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
