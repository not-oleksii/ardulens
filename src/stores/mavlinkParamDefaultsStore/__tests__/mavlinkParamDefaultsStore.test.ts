import { afterEach, describe, expect, it } from "vitest";
import { useMavlinkParamDefaultsStore } from "../mavlinkParamDefaultsStore";

describe("mavlinkParamDefaultsStore", () => {
  afterEach(() => {
    useMavlinkParamDefaultsStore.getState().reset();
  });

  it("defaults to idle, nothing in progress", () => {
    const state = useMavlinkParamDefaultsStore.getState();
    expect(state.phase).toBe("idle");
    expect(state.bytesReceived).toBe(0);
    expect(state.totalBytes).toBeNull();
    expect(state.defaults).toBeNull();
    expect(state.error).toBeNull();
  });

  it("start moves to opening and clears any previous run's state", () => {
    useMavlinkParamDefaultsStore.getState().setError("boom");
    useMavlinkParamDefaultsStore.getState().start();
    const state = useMavlinkParamDefaultsStore.getState();
    expect(state.phase).toBe("opening");
    expect(state.error).toBeNull();
  });

  it("setOpened moves to downloading and records the file's total size", () => {
    useMavlinkParamDefaultsStore.getState().start();
    useMavlinkParamDefaultsStore.getState().setOpened(4096);
    const state = useMavlinkParamDefaultsStore.getState();
    expect(state.phase).toBe("downloading");
    expect(state.totalBytes).toBe(4096);
  });

  it("setProgress tracks bytes received so far", () => {
    useMavlinkParamDefaultsStore.getState().setProgress(512);
    expect(useMavlinkParamDefaultsStore.getState().bytesReceived).toBe(512);
  });

  it("setDone records the parsed defaults map and moves to done", () => {
    useMavlinkParamDefaultsStore.getState().setDone({ ARSPD_USE: 0 });
    const state = useMavlinkParamDefaultsStore.getState();
    expect(state.phase).toBe("done");
    expect(state.defaults).toEqual({ ARSPD_USE: 0 });
  });

  it("setError records the error and moves to error", () => {
    useMavlinkParamDefaultsStore.getState().setError("session open timed out");
    const state = useMavlinkParamDefaultsStore.getState();
    expect(state.phase).toBe("error");
    expect(state.error).toBe("session open timed out");
  });

  it("resets back to idle", () => {
    useMavlinkParamDefaultsStore.getState().start();
    useMavlinkParamDefaultsStore.getState().setOpened(100);
    useMavlinkParamDefaultsStore.getState().setProgress(50);
    useMavlinkParamDefaultsStore.getState().reset();
    const state = useMavlinkParamDefaultsStore.getState();
    expect(state.phase).toBe("idle");
    expect(state.bytesReceived).toBe(0);
    expect(state.totalBytes).toBeNull();
  });
});
