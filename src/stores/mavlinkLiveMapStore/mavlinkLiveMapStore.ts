import { create } from "zustand";
import type { MavlinkLiveMapState } from "./types";

const INITIAL = {
  flyToTarget: null,
  homeTarget: null,
  hasFlownOnce: false,
} as const;

export const useMavlinkLiveMapStore = create<MavlinkLiveMapState>((set) => ({
  ...INITIAL,
  setFlyToTarget: (target) => set({ flyToTarget: target }),
  setHomeTarget: (target) => set({ homeTarget: target }),
  setHasFlownOnce: () => set({ hasFlownOnce: true }),
  reset: () => set(INITIAL),
}));
