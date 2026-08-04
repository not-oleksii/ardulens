import { create } from "zustand";
import type { MavlinkVehicleState } from "./types";

export const useMavlinkVehicleStore = create<MavlinkVehicleState>((set) => ({
  vehicle: null,
  setVehicle: (vehicle) => set({ vehicle }),
  reset: () => set({ vehicle: null }),
}));
