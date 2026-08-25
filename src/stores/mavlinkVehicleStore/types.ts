import type { MavAutopilot, MavCmd, MavResult, MavState, MavType } from "../../mavlink/registry/registry";

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
  /** The result of the most recently sent NAV_TAKEOFF/DO_REPOSITION/DO_SET_HOME command - null
   *  before any attempt this connection. RTL has no equivalent here since it's sent as a plain
   *  SET_MODE (see handleRtl/registry.ts's SET_MODE comment), same as any other mode change. */
  flightCommandAck: { command: MavCmd; result: MavResult } | null;
  setFlightCommandAck: (ack: { command: MavCmd; result: MavResult }) => void;
  reset: () => void;
}
