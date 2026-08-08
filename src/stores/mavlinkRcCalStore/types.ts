import type { MavResult } from "../../mavlink/registry/registry";

export interface RcCalCommandAck {
  /** Always PREFLIGHT_CALIBRATION - shared with accel cal, distinguished by whichever store
   *  sent it last (see ArduPilotSetupView's pendingCalibrationKindRef). */
  command: number;
  result: MavResult;
}

export interface RcCalChannelRange {
  min: number;
  max: number;
  trim: number;
  reversed: boolean;
}

export interface MavlinkRcCalState {
  /** Latest raw PWM per channel (1-indexed), updated from every RC_CHANNELS packet regardless
   *  of whether calibration is active - lets the UI show live stick/switch positions (and
   *  confirm the receiver is even connected) before Start is clicked. */
  live: Record<number, number>;
  chanCount: number;
  active: boolean;
  /** Captured min/max/trim/reversed per channel, seeded from the first RC_CHANNELS packet
   *  after Start and expanded as further packets arrive - only meaningful while `active`. */
  channels: Record<number, RcCalChannelRange>;
  lastCommandAck: RcCalCommandAck | null;
  start: () => void;
  observe: (raw: Record<number, number>, chanCount: number) => void;
  toggleReversed: (channel: number) => void;
  setLastCommandAck: (ack: RcCalCommandAck | null) => void;
  stop: () => void;
  reset: () => void;
}
