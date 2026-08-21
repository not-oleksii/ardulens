import type { GpsFixType } from "../../mavlink/registry/registry";

export interface AttitudeTelemetry {
  rollRad: number;
  pitchRad: number;
  yawRad: number;
  updatedAt: number;
}

export interface VfrHudTelemetry {
  airspeed: number;
  groundspeed: number;
  headingDeg: number;
  throttlePercent: number;
  altitudeM: number;
  climbMs: number;
  updatedAt: number;
}

export interface BatteryTelemetry {
  voltageV: number;
  currentA: number | null;
  remainingPercent: number | null;
  updatedAt: number;
}

/** Raw SYS_STATUS sensor bitmasks (see registry.ts's MavSysStatusSensor comment) - kept as the
 *  raw present/enabled/health fields rather than pre-decoded, so the UI can decide which
 *  present sensors to actually list. */
export interface SensorHealthTelemetry {
  present: number;
  enabled: number;
  health: number;
  updatedAt: number;
}

export interface GpsTelemetry {
  fixType: GpsFixType;
  satellitesVisible: number;
  updatedAt: number;
}

export interface PositionTelemetry {
  lat: number;
  lon: number;
  relativeAltM: number;
  updatedAt: number;
}

export interface MavlinkTelemetryState {
  attitude: AttitudeTelemetry | null;
  vfrHud: VfrHudTelemetry | null;
  battery: BatteryTelemetry | null;
  gps: GpsTelemetry | null;
  /** From GPS2_RAW - stays null for the many vehicles that only have one GPS receiver, rather
   *  than a permanent "no data" row for hardware that doesn't exist on this vehicle. */
  gps2: GpsTelemetry | null;
  position: PositionTelemetry | null;
  sensorHealth: SensorHealthTelemetry | null;
  /** Live PWM per output channel (1-indexed), from SERVO_OUTPUT_RAW - lets a servo test show
   *  the vehicle's actual reported output rather than just the value we last sent. */
  servoOutputs: Record<number, number>;
  setAttitude: (attitude: AttitudeTelemetry) => void;
  setVfrHud: (vfrHud: VfrHudTelemetry) => void;
  setBattery: (battery: BatteryTelemetry) => void;
  setGps: (gps: GpsTelemetry) => void;
  setGps2: (gps2: GpsTelemetry) => void;
  setPosition: (position: PositionTelemetry) => void;
  setSensorHealth: (sensorHealth: SensorHealthTelemetry) => void;
  /** Merges a partial channel->pwm update (e.g. just channels 1-8 or 9-16, matching
   *  SERVO_OUTPUT_RAW's `port` grouping) into the existing servoOutputs record. */
  mergeServoOutputs: (channelValues: Record<number, number>) => void;
  reset: () => void;
}
