import type { MavResult } from "../../mavlink/registry/registry";

export interface AccelCalCommandAck {
  /** The MAV_CMD id this ack answers (always PREFLIGHT_CALIBRATION - both the one-shot level
   *  cal and the full 6-position cal use the same command id, distinguished by `activeCalType`). */
  command: number;
  result: MavResult;
}

export interface MavlinkAccelCalState {
  /** Which calibration the user last triggered - needed to interpret PREFLIGHT_CALIBRATION's
   *  ack correctly, since both flows share the same MAV_CMD id. Null once neither is active. */
  activeCalType: "level" | "full" | null;
  /** The position (ACCELCAL_VEHICLE_POS code) the vehicle most recently asked the user to move
   *  to, via its own AccelcalVehiclePosCommand - null until the full cal starts requesting one. */
  requestedPosition: number | null;
  /** Positions the user has confirmed placement for (echoed back to the vehicle), in order. */
  confirmedPositions: number[];
  /** Set once the vehicle sends the terminal SUCCESS/FAILED position code. */
  result: "success" | "failed" | null;
  lastCommandAck: AccelCalCommandAck | null;
  startLevel: () => void;
  startFull: () => void;
  setRequestedPosition: (position: number) => void;
  confirmPosition: (position: number) => void;
  setResult: (result: "success" | "failed") => void;
  setLastCommandAck: (ack: AccelCalCommandAck | null) => void;
  reset: () => void;
}
