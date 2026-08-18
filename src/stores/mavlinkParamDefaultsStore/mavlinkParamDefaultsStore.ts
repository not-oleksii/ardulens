import { create } from "zustand";
import type { MavlinkParamDefaultsState } from "./types";

const INITIAL: Pick<MavlinkParamDefaultsState, "phase" | "bytesReceived" | "totalBytes" | "defaults" | "error"> = {
  phase: "idle",
  bytesReceived: 0,
  totalBytes: null,
  defaults: null,
  error: null,
};

export const useMavlinkParamDefaultsStore = create<MavlinkParamDefaultsState>((set) => ({
  ...INITIAL,
  start: () => set({ ...INITIAL, phase: "opening" }),
  setOpened: (totalBytes) => set({ phase: "downloading", totalBytes }),
  setProgress: (bytesReceived) => set({ bytesReceived }),
  setDone: (defaults) => set({ phase: "done", defaults }),
  setError: (error) => set({ phase: "error", error }),
  reset: () => set({ ...INITIAL }),
}));
