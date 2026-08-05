import type { MagCalStatus, MavResult } from "../../mavlink/registry/registry";

export interface CompassCalProgress {
  compassId: number;
  /** Bitmask of which compasses are being calibrated together in this attempt. */
  calMask: number;
  calStatus: MagCalStatus;
  attempt: number;
  completionPct: number;
  /** MAG_CAL_PROGRESS's 80-bit geodesic-section coverage mask, 10 bytes - see geodesicGrid.ts. */
  completionMask: number[];
  updatedAt: number;
}

export interface CompassCalReport {
  compassId: number;
  calMask: number;
  calStatus: MagCalStatus;
  /** Calibration fitness in mgauss - lower is better; ArduPilot's usual pass threshold is ~16. */
  fitness: number;
  offset: { x: number; y: number; z: number };
  autosaved: boolean;
  updatedAt: number;
}

export interface CompassCalCommandAck {
  /** The MAV_CMD id this ack answers (DO_START/ACCEPT/CANCEL_MAG_CAL). */
  command: number;
  result: MavResult;
}

export interface MavlinkCompassCalState {
  /** Keyed by compass_id - one entry per compass currently reporting calibration progress. */
  progress: Record<number, CompassCalProgress>;
  /** Keyed by compass_id - the final MAG_CAL_REPORT for each compass, once calibration ends. */
  reports: Record<number, CompassCalReport>;
  /** The vehicle's COMMAND_ACK for the last start/accept/cancel command sent, e.g. DENIED if
   *  a compass is unhealthy - null until one of those commands has been sent. */
  lastCommandAck: CompassCalCommandAck | null;
  setProgress: (progress: CompassCalProgress) => void;
  setReport: (report: CompassCalReport) => void;
  setLastCommandAck: (ack: CompassCalCommandAck | null) => void;
  reset: () => void;
}
