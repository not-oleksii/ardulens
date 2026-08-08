import { create } from "zustand";
import type { MavlinkAccelCalState } from "./types";

const INITIAL = {
  activeCalType: null,
  requestedPosition: null,
  confirmedPositions: [],
  result: null,
  lastCommandAck: null,
} as const;

export const useMavlinkAccelCalStore = create<MavlinkAccelCalState>((set) => ({
  ...INITIAL,
  startLevel: () => set({ ...INITIAL, activeCalType: "level" }),
  startFull: () => set({ ...INITIAL, activeCalType: "full" }),
  setRequestedPosition: (position) => set({ requestedPosition: position }),
  confirmPosition: (position) => set((s) => ({ confirmedPositions: [...s.confirmedPositions, position] })),
  setResult: (result) => set({ result, requestedPosition: null }),
  setLastCommandAck: (lastCommandAck) => set({ lastCommandAck }),
  reset: () => set({ ...INITIAL }),
}));
