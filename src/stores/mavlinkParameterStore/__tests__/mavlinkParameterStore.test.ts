import { afterEach, describe, expect, it } from "vitest";
import { MavParamType } from "../../../mavlink/registry/registry";
import { useMavlinkParameterStore } from "../mavlinkParameterStore";
import type { ParamEntry } from "../types";

const ENTRY: ParamEntry = {
  name: "ARSPD_USE",
  value: 1,
  type: MavParamType.INT8,
  index: 5,
  updatedAt: 1000,
  dirty: false,
};

describe("mavlinkParameterStore", () => {
  afterEach(() => {
    useMavlinkParameterStore.getState().reset();
  });

  it("defaults to no params known", () => {
    const state = useMavlinkParameterStore.getState();
    expect(state.params).toEqual({});
    expect(state.expectedCount).toBeNull();
  });

  it("upserts a param entry and tracks the expected count", () => {
    useMavlinkParameterStore.getState().setParam(ENTRY, 742);
    const state = useMavlinkParameterStore.getState();
    expect(state.params["ARSPD_USE"]).toEqual(ENTRY);
    expect(state.expectedCount).toBe(742);
  });

  it("keeps previously received params when a new one arrives", () => {
    useMavlinkParameterStore.getState().setParam(ENTRY, 742);
    const second: ParamEntry = { ...ENTRY, name: "ARSPD_RATIO", index: 6, value: 2 };
    useMavlinkParameterStore.getState().setParam(second, 742);
    const state = useMavlinkParameterStore.getState();
    expect(Object.keys(state.params).sort()).toEqual(["ARSPD_RATIO", "ARSPD_USE"]);
  });

  it("merges a batch of entries in one update, keeping previously received params", () => {
    useMavlinkParameterStore.getState().setParam(ENTRY, 742);
    const batch: ParamEntry[] = [
      { ...ENTRY, name: "ARSPD_RATIO", index: 6, value: 2 },
      { ...ENTRY, name: "ARSPD_FBW_MIN", index: 7, value: 15 },
    ];
    useMavlinkParameterStore.getState().setParams(batch, 742);
    const state = useMavlinkParameterStore.getState();
    expect(Object.keys(state.params).sort()).toEqual(["ARSPD_FBW_MIN", "ARSPD_RATIO", "ARSPD_USE"]);
    expect(state.params["ARSPD_FBW_MIN"]?.value).toBe(15);
    expect(state.expectedCount).toBe(742);
  });

  it("does nothing when flushing an empty batch", () => {
    useMavlinkParameterStore.getState().setParam(ENTRY, 742);
    useMavlinkParameterStore.getState().setParams([], 999);
    const state = useMavlinkParameterStore.getState();
    expect(Object.keys(state.params)).toEqual(["ARSPD_USE"]);
    expect(state.expectedCount).toBe(742); // unchanged - the empty-batch early return skips it
  });

  it("marks an existing param dirty and clears it again", () => {
    useMavlinkParameterStore.getState().setParam(ENTRY, 742);
    useMavlinkParameterStore.getState().markDirty("ARSPD_USE", true);
    expect(useMavlinkParameterStore.getState().params["ARSPD_USE"]?.dirty).toBe(true);
    useMavlinkParameterStore.getState().markDirty("ARSPD_USE", false);
    expect(useMavlinkParameterStore.getState().params["ARSPD_USE"]?.dirty).toBe(false);
  });

  it("does nothing when marking a param that hasn't been received yet", () => {
    useMavlinkParameterStore.getState().markDirty("UNKNOWN", true);
    expect(useMavlinkParameterStore.getState().params).toEqual({});
  });

  it("resets back to empty", () => {
    useMavlinkParameterStore.getState().setParam(ENTRY, 742);
    useMavlinkParameterStore.getState().reset();
    const state = useMavlinkParameterStore.getState();
    expect(state.params).toEqual({});
    expect(state.expectedCount).toBeNull();
  });
});
