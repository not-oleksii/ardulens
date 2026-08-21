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

/** From EKF_STATUS_REPORT - each variance is normalized so ~1.0 is AP_NavEKF's own "degraded
 *  estimate" threshold (the same boundary its internal innovation-ratio checks gate on), not an
 *  arbitrary UI-picked number. */
export interface EkfTelemetry {
  velocityVariance: number;
  posHorizVariance: number;
  posVertVariance: number;
  compassVariance: number;
  updatedAt: number;
}

/** From VIBRATION - per-axis accelerometer noise (m/s/s) plus each axis's cumulative clipping
 *  event count (a nonzero count means the accelerometer has been saturating, a more serious
 *  sign than the vibration level alone). */
export interface VibrationTelemetry {
  x: number;
  y: number;
  z: number;
  clippingX: number;
  clippingY: number;
  clippingZ: number;
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
  ekf: EkfTelemetry | null;
  vibration: VibrationTelemetry | null;
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
  setEkf: (ekf: EkfTelemetry) => void;
  setVibration: (vibration: VibrationTelemetry) => void;
  /** Merges a partial channel->pwm update (e.g. just channels 1-8 or 9-16, matching
   *  SERVO_OUTPUT_RAW's `port` grouping) into the existing servoOutputs record. */
  mergeServoOutputs: (channelValues: Record<number, number>) => void;
  reset: () => void;
}
