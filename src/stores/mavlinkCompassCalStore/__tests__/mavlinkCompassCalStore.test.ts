import { afterEach, describe, expect, it } from "vitest";
import { MagCalStatus, MavCmd, MavResult } from "../../../mavlink/registry/registry";
import { useMavlinkCompassCalStore } from "../mavlinkCompassCalStore";
import type { CompassCalProgress, CompassCalReport } from "../types";

const PROGRESS: CompassCalProgress = {
  compassId: 0,
  calMask: 0b0000_0111,
  calStatus: MagCalStatus.RUNNING_STEP_ONE,
  attempt: 1,
  completionPct: 42,
  completionMask: new Array<number>(10).fill(0),
  updatedAt: 1000,
};

const REPORT: CompassCalReport = {
  compassId: 0,
  calMask: 0b0000_0111,
  calStatus: MagCalStatus.SUCCESS,
  fitness: 12.5,
  offset: { x: 1, y: 2, z: 3 },
  autosaved: true,
  updatedAt: 2000,
};

describe("mavlinkCompassCalStore", () => {
  afterEach(() => {
    useMavlinkCompassCalStore.getState().reset();
  });

  it("defaults to no progress or reports known", () => {
    const state = useMavlinkCompassCalStore.getState();
    expect(state.progress).toEqual({});
    expect(state.reports).toEqual({});
    expect(state.lastCommandAck).toBeNull();
  });

  it("tracks the last start/accept/cancel command's ack result", () => {
    useMavlinkCompassCalStore.getState().setLastCommandAck({ command: MavCmd.DO_START_MAG_CAL, result: MavResult.DENIED });
    expect(useMavlinkCompassCalStore.getState().lastCommandAck).toEqual({
      command: MavCmd.DO_START_MAG_CAL,
      result: MavResult.DENIED,
    });
  });

  it("upserts progress keyed by compass id", () => {
    useMavlinkCompassCalStore.getState().setProgress(PROGRESS);
    expect(useMavlinkCompassCalStore.getState().progress[0]).toEqual(PROGRESS);
  });

  it("keeps progress for other compasses when one updates", () => {
    useMavlinkCompassCalStore.getState().setProgress(PROGRESS);
    const second: CompassCalProgress = { ...PROGRESS, compassId: 1, completionPct: 10 };
    useMavlinkCompassCalStore.getState().setProgress(second);
    const state = useMavlinkCompassCalStore.getState();
    expect(state.progress[0]?.completionPct).toBe(42);
    expect(state.progress[1]?.completionPct).toBe(10);
  });

  it("upserts a report keyed by compass id", () => {
    useMavlinkCompassCalStore.getState().setReport(REPORT);
    expect(useMavlinkCompassCalStore.getState().reports[0]).toEqual(REPORT);
  });

  it("resets back to empty", () => {
    useMavlinkCompassCalStore.getState().setProgress(PROGRESS);
    useMavlinkCompassCalStore.getState().setReport(REPORT);
    useMavlinkCompassCalStore.getState().setLastCommandAck({ command: MavCmd.DO_START_MAG_CAL, result: MavResult.ACCEPTED });
    useMavlinkCompassCalStore.getState().reset();
    const state = useMavlinkCompassCalStore.getState();
    expect(state.progress).toEqual({});
    expect(state.reports).toEqual({});
    expect(state.lastCommandAck).toBeNull();
  });
});
