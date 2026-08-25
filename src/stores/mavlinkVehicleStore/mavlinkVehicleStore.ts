import { create } from "zustand";
import type { MavlinkVehicleState } from "./types";

export const useMavlinkVehicleStore = create<MavlinkVehicleState>((set) => ({
  vehicle: null,
  setVehicle: (vehicle) => set({ vehicle }),
  armCommandAck: null,
  setArmCommandAck: (armCommandAck) => set({ armCommandAck }),
  flightCommandAck: null,
  setFlightCommandAck: (flightCommandAck) => set({ flightCommandAck }),
  reset: () => set({ vehicle: null, armCommandAck: null, flightCommandAck: null }),
}));
