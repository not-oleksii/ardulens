import { afterEach, describe, expect, it } from "vitest";
import { useMavlinkConnectionStore } from "../mavlinkConnectionStore";

describe("mavlinkConnectionStore", () => {
  afterEach(() => {
    useMavlinkConnectionStore.getState().reset();
  });

  it("defaults to idle with no data transferred", () => {
    const s = useMavlinkConnectionStore.getState();
    expect(s.status).toBe("idle");
    expect(s.detail).toBeNull();
    expect(s.errorMessage).toBeNull();
    expect(s.bytesReceived).toBe(0);
    expect(s.bytesSent).toBe(0);
  });

  it("moves to connecting, clearing any previous error", () => {
    useMavlinkConnectionStore.getState().setError("boom");
    useMavlinkConnectionStore.getState().setConnecting();

    const s = useMavlinkConnectionStore.getState();
    expect(s.status).toBe("connecting");
    expect(s.errorMessage).toBeNull();
  });

  it("moves to connected with a detail string", () => {
    useMavlinkConnectionStore.getState().setConnected("udp:0.0.0.0:14550");

    const s = useMavlinkConnectionStore.getState();
    expect(s.status).toBe("connected");
    expect(s.detail).toBe("udp:0.0.0.0:14550");
  });

  it("moves to idle and clears detail on disconnect", () => {
    useMavlinkConnectionStore.getState().setConnected("udp:0.0.0.0:14550");
    useMavlinkConnectionStore.getState().setDisconnected();

    const s = useMavlinkConnectionStore.getState();
    expect(s.status).toBe("idle");
    expect(s.detail).toBeNull();
  });

  it("moves to error with a message", () => {
    useMavlinkConnectionStore.getState().setError("port busy");

    const s = useMavlinkConnectionStore.getState();
    expect(s.status).toBe("error");
    expect(s.errorMessage).toBe("port busy");
  });

  it("accumulates received and sent byte counters independently", () => {
    useMavlinkConnectionStore.getState().addBytesReceived(10);
    useMavlinkConnectionStore.getState().addBytesReceived(5);
    useMavlinkConnectionStore.getState().addBytesSent(3);

    const s = useMavlinkConnectionStore.getState();
    expect(s.bytesReceived).toBe(15);
    expect(s.bytesSent).toBe(3);
  });

  it("resets everything back to defaults", () => {
    useMavlinkConnectionStore.getState().setConnected("serial:COM3@57600");
    useMavlinkConnectionStore.getState().addBytesReceived(100);

    useMavlinkConnectionStore.getState().reset();

    const s = useMavlinkConnectionStore.getState();
    expect(s.status).toBe("idle");
    expect(s.detail).toBeNull();
    expect(s.bytesReceived).toBe(0);
  });
});
