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
  position: PositionTelemetry | null;
  setAttitude: (attitude: AttitudeTelemetry) => void;
  setVfrHud: (vfrHud: VfrHudTelemetry) => void;
  setBattery: (battery: BatteryTelemetry) => void;
  setGps: (gps: GpsTelemetry) => void;
  setPosition: (position: PositionTelemetry) => void;
  reset: () => void;
}
