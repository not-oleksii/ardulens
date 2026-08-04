import type { MavAutopilot, MavState, MavType } from "../../mavlink/registry/registry";

export interface VehicleInfo {
  sysid: number;
  compid: number;
  type: MavType;
  autopilot: MavAutopilot;
  armed: boolean;
  systemStatus: MavState;
  customMode: number;
  lastHeartbeatAt: number;
}

export interface MavlinkVehicleState {
  vehicle: VehicleInfo | null;
  setVehicle: (vehicle: VehicleInfo) => void;
  reset: () => void;
}
