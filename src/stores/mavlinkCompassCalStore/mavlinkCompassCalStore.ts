import { create } from "zustand";
import type { MavlinkCompassCalState } from "./types";

export const useMavlinkCompassCalStore = create<MavlinkCompassCalState>((set) => ({
  progress: {},
  reports: {},
  lastCommandAck: null,
  setProgress: (progress) => set((s) => ({ progress: { ...s.progress, [progress.compassId]: progress } })),
  setReport: (report) => set((s) => ({ reports: { ...s.reports, [report.compassId]: report } })),
  setLastCommandAck: (lastCommandAck) => set({ lastCommandAck }),
  reset: () => set({ progress: {}, reports: {}, lastCommandAck: null }),
}));
