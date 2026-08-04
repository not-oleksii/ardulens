import { afterEach, describe, expect, it } from "vitest";
import { GpsFixType } from "../../../mavlink/registry/registry";
import { useMavlinkTelemetryStore } from "../mavlinkTelemetryStore";
import type { AttitudeTelemetry, BatteryTelemetry, GpsTelemetry, PositionTelemetry, VfrHudTelemetry } from "../types";

const ATTITUDE: AttitudeTelemetry = { rollRad: 0.1, pitchRad: -0.05, yawRad: 1.2, updatedAt: 1000 };
const VFR_HUD: VfrHudTelemetry = {
  airspeed: 12,
  groundspeed: 11.5,
  headingDeg: 90,
  throttlePercent: 50,
  altitudeM: 120,
  climbMs: 0.5,
  updatedAt: 1000,
};
const BATTERY: BatteryTelemetry = { voltageV: 16.8, currentA: 5.2, remainingPercent: 80, updatedAt: 1000 };
const GPS: GpsTelemetry = { fixType: GpsFixType.GPS_FIX_TYPE_3D_FIX, satellitesVisible: 12, updatedAt: 1000 };
const POSITION: PositionTelemetry = { lat: 50.45, lon: 30.52, relativeAltM: 100, updatedAt: 1000 };

describe("mavlinkTelemetryStore", () => {
  afterEach(() => {
    useMavlinkTelemetryStore.getState().reset();
  });

  it("defaults to no telemetry known", () => {
    const state = useMavlinkTelemetryStore.getState();
    expect(state.attitude).toBeNull();
    expect(state.vfrHud).toBeNull();
    expect(state.battery).toBeNull();
    expect(state.gps).toBeNull();
    expect(state.position).toBeNull();
  });

  it("sets each telemetry slice independently", () => {
    useMavlinkTelemetryStore.getState().setAttitude(ATTITUDE);
    useMavlinkTelemetryStore.getState().setVfrHud(VFR_HUD);
    useMavlinkTelemetryStore.getState().setBattery(BATTERY);
    useMavlinkTelemetryStore.getState().setGps(GPS);
    useMavlinkTelemetryStore.getState().setPosition(POSITION);

    const state = useMavlinkTelemetryStore.getState();
    expect(state.attitude).toEqual(ATTITUDE);
    expect(state.vfrHud).toEqual(VFR_HUD);
    expect(state.battery).toEqual(BATTERY);
    expect(state.gps).toEqual(GPS);
    expect(state.position).toEqual(POSITION);
  });

  it("resets every slice back to null", () => {
    useMavlinkTelemetryStore.getState().setAttitude(ATTITUDE);
    useMavlinkTelemetryStore.getState().setBattery(BATTERY);
    useMavlinkTelemetryStore.getState().reset();

    const state = useMavlinkTelemetryStore.getState();
    expect(state.attitude).toBeNull();
    expect(state.battery).toBeNull();
  });
});
