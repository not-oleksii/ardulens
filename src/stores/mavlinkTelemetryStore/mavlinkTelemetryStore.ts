import { create } from "zustand";
import type { MavlinkTelemetryState } from "./types";

export const useMavlinkTelemetryStore = create<MavlinkTelemetryState>((set) => ({
  attitude: null,
  vfrHud: null,
  battery: null,
  gps: null,
  gps2: null,
  position: null,
  sensorHealth: null,
  ekf: null,
  vibration: null,
  servoOutputs: {},
  setAttitude: (attitude) => set({ attitude }),
  setVfrHud: (vfrHud) => set({ vfrHud }),
  setBattery: (battery) => set({ battery }),
  setGps: (gps) => set({ gps }),
  setGps2: (gps2) => set({ gps2 }),
  setPosition: (position) => set({ position }),
  setSensorHealth: (sensorHealth) => set({ sensorHealth }),
  setEkf: (ekf) => set({ ekf }),
  setVibration: (vibration) => set({ vibration }),
  mergeServoOutputs: (channelValues) => set((s) => ({ servoOutputs: { ...s.servoOutputs, ...channelValues } })),
  reset: () =>
    set({
      attitude: null,
      vfrHud: null,
      battery: null,
      gps: null,
      gps2: null,
      position: null,
      sensorHealth: null,
      ekf: null,
      vibration: null,
      servoOutputs: {},
    }),
}));
