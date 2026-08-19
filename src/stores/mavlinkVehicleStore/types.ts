import type { MavAutopilot, MavResult, MavState, MavType } from "../../mavlink/registry/registry";

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
  /** The result of the most recently sent COMPONENT_ARM_DISARM command - null before any
   *  attempt this connection. Mode changes have no equivalent (see registry.ts's SET_MODE
   *  comment on why - ArduPilot never acks it). */
  armCommandAck: { result: MavResult } | null;
  setArmCommandAck: (ack: { result: MavResult }) => void;
  reset: () => void;
}
