import { afterEach, describe, expect, it } from "vitest";
import { useMavlinkVehicleStore } from "../mavlinkVehicleStore";
import type { VehicleInfo } from "../types";

const SAMPLE: VehicleInfo = {
  type: 2,
  autopilot: 3,
  armed: false,
  systemStatus: 4,
  customMode: 0,
  lastHeartbeatAt: 1000,
};

describe("mavlinkVehicleStore", () => {
  afterEach(() => {
    useMavlinkVehicleStore.getState().reset();
  });

  it("defaults to no vehicle known", () => {
    expect(useMavlinkVehicleStore.getState().vehicle).toBeNull();
  });

  it("sets the vehicle info from a heartbeat", () => {
    useMavlinkVehicleStore.getState().setVehicle(SAMPLE);
    expect(useMavlinkVehicleStore.getState().vehicle).toEqual(SAMPLE);
  });

  it("resets back to null", () => {
    useMavlinkVehicleStore.getState().setVehicle(SAMPLE);
    useMavlinkVehicleStore.getState().reset();
    expect(useMavlinkVehicleStore.getState().vehicle).toBeNull();
  });
});
