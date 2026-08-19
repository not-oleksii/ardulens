import { afterEach, describe, expect, it } from "vitest";
import { GpsFixType } from "../../../mavlink/registry/registry";
import { useMavlinkTelemetryStore } from "../mavlinkTelemetryStore";
import type { AttitudeTelemetry, BatteryTelemetry, GpsTelemetry, PositionTelemetry, SensorHealthTelemetry, VfrHudTelemetry } from "../types";

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
const SENSOR_HEALTH: SensorHealthTelemetry = { present: 0b111, enabled: 0b111, health: 0b101, updatedAt: 1000 };

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
    expect(state.sensorHealth).toBeNull();
    expect(state.servoOutputs).toEqual({});
  });

  it("merges a partial servo-output update (e.g. channels 1-8) without discarding others (e.g. 9-16)", () => {
    useMavlinkTelemetryStore.getState().mergeServoOutputs({ 9: 1500, 10: 1600 });
    useMavlinkTelemetryStore.getState().mergeServoOutputs({ 1: 1100, 2: 1900 });
    expect(useMavlinkTelemetryStore.getState().servoOutputs).toEqual({ 1: 1100, 2: 1900, 9: 1500, 10: 1600 });
  });

  it("overwrites a channel's value when it updates again", () => {
    useMavlinkTelemetryStore.getState().mergeServoOutputs({ 1: 1100 });
    useMavlinkTelemetryStore.getState().mergeServoOutputs({ 1: 1200 });
    expect(useMavlinkTelemetryStore.getState().servoOutputs[1]).toBe(1200);
  });

  it("sets each telemetry slice independently", () => {
    useMavlinkTelemetryStore.getState().setAttitude(ATTITUDE);
    useMavlinkTelemetryStore.getState().setVfrHud(VFR_HUD);
    useMavlinkTelemetryStore.getState().setBattery(BATTERY);
    useMavlinkTelemetryStore.getState().setGps(GPS);
    useMavlinkTelemetryStore.getState().setPosition(POSITION);
    useMavlinkTelemetryStore.getState().setSensorHealth(SENSOR_HEALTH);

    const state = useMavlinkTelemetryStore.getState();
    expect(state.attitude).toEqual(ATTITUDE);
    expect(state.vfrHud).toEqual(VFR_HUD);
    expect(state.battery).toEqual(BATTERY);
    expect(state.gps).toEqual(GPS);
    expect(state.position).toEqual(POSITION);
    expect(state.sensorHealth).toEqual(SENSOR_HEALTH);
  });

  it("resets every slice back to null", () => {
    useMavlinkTelemetryStore.getState().setAttitude(ATTITUDE);
    useMavlinkTelemetryStore.getState().setBattery(BATTERY);
    useMavlinkTelemetryStore.getState().setSensorHealth(SENSOR_HEALTH);
    useMavlinkTelemetryStore.getState().mergeServoOutputs({ 1: 1500 });
    useMavlinkTelemetryStore.getState().reset();

    const state = useMavlinkTelemetryStore.getState();
    expect(state.attitude).toBeNull();
    expect(state.battery).toBeNull();
    expect(state.sensorHealth).toBeNull();
    expect(state.servoOutputs).toEqual({});
  });
});
