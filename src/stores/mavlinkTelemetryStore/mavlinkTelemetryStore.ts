import { create } from "zustand";
import type { MavlinkTelemetryState } from "./types";

export const useMavlinkTelemetryStore = create<MavlinkTelemetryState>((set) => ({
  attitude: null,
  vfrHud: null,
  battery: null,
  gps: null,
  position: null,
  setAttitude: (attitude) => set({ attitude }),
  setVfrHud: (vfrHud) => set({ vfrHud }),
  setBattery: (battery) => set({ battery }),
  setGps: (gps) => set({ gps }),
  setPosition: (position) => set({ position }),
  reset: () => set({ attitude: null, vfrHud: null, battery: null, gps: null, position: null }),
}));
