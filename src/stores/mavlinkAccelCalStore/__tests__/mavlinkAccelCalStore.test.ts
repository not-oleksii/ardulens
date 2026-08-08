import { afterEach, describe, expect, it } from "vitest";
import { AccelcalVehiclePos, MavCmd, MavResult } from "../../../mavlink/registry/registry";
import { useMavlinkAccelCalStore } from "../mavlinkAccelCalStore";

describe("mavlinkAccelCalStore", () => {
  afterEach(() => {
    useMavlinkAccelCalStore.getState().reset();
  });

  it("defaults to idle, nothing in progress", () => {
    const state = useMavlinkAccelCalStore.getState();
    expect(state.activeCalType).toBeNull();
    expect(state.requestedPosition).toBeNull();
    expect(state.confirmedPositions).toEqual([]);
    expect(state.result).toBeNull();
    expect(state.lastCommandAck).toBeNull();
  });

  it("startLevel sets activeCalType and clears any previous run's state", () => {
    useMavlinkAccelCalStore.getState().setResult("failed");
    useMavlinkAccelCalStore.getState().startLevel();
    const state = useMavlinkAccelCalStore.getState();
    expect(state.activeCalType).toBe("level");
    expect(state.result).toBeNull();
  });

  it("startFull sets activeCalType and clears any previous run's state", () => {
    useMavlinkAccelCalStore.getState().confirmPosition(AccelcalVehiclePos.LEVEL);
    useMavlinkAccelCalStore.getState().startFull();
    const state = useMavlinkAccelCalStore.getState();
    expect(state.activeCalType).toBe("full");
    expect(state.confirmedPositions).toEqual([]);
  });

  it("tracks the vehicle's requested position", () => {
    useMavlinkAccelCalStore.getState().setRequestedPosition(AccelcalVehiclePos.LEFT);
    expect(useMavlinkAccelCalStore.getState().requestedPosition).toBe(AccelcalVehiclePos.LEFT);
  });

  it("appends confirmed positions in order", () => {
    useMavlinkAccelCalStore.getState().confirmPosition(AccelcalVehiclePos.LEVEL);
    useMavlinkAccelCalStore.getState().confirmPosition(AccelcalVehiclePos.LEFT);
    expect(useMavlinkAccelCalStore.getState().confirmedPositions).toEqual([
      AccelcalVehiclePos.LEVEL,
      AccelcalVehiclePos.LEFT,
    ]);
  });

  it("setResult also clears requestedPosition (the cal is over, nothing left to confirm)", () => {
    useMavlinkAccelCalStore.getState().setRequestedPosition(AccelcalVehiclePos.BACK);
    useMavlinkAccelCalStore.getState().setResult("success");
    const state = useMavlinkAccelCalStore.getState();
    expect(state.result).toBe("success");
    expect(state.requestedPosition).toBeNull();
  });

  it("tracks the last PREFLIGHT_CALIBRATION command ack", () => {
    useMavlinkAccelCalStore.getState().setLastCommandAck({ command: MavCmd.PREFLIGHT_CALIBRATION, result: MavResult.DENIED });
    expect(useMavlinkAccelCalStore.getState().lastCommandAck).toEqual({
      command: MavCmd.PREFLIGHT_CALIBRATION,
      result: MavResult.DENIED,
    });
  });

  it("resets back to idle", () => {
    useMavlinkAccelCalStore.getState().startFull();
    useMavlinkAccelCalStore.getState().setRequestedPosition(AccelcalVehiclePos.RIGHT);
    useMavlinkAccelCalStore.getState().confirmPosition(AccelcalVehiclePos.LEVEL);
    useMavlinkAccelCalStore.getState().setLastCommandAck({ command: MavCmd.PREFLIGHT_CALIBRATION, result: MavResult.ACCEPTED });
    useMavlinkAccelCalStore.getState().reset();
    const state = useMavlinkAccelCalStore.getState();
    expect(state.activeCalType).toBeNull();
    expect(state.requestedPosition).toBeNull();
    expect(state.confirmedPositions).toEqual([]);
    expect(state.result).toBeNull();
    expect(state.lastCommandAck).toBeNull();
  });
});
