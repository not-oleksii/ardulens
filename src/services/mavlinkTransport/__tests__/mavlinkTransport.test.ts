import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MavType } from "../../../mavlink/registry/registry";
import {
  connectMock,
  connectSerial,
  connectUdp,
  DATA_EVENT,
  disconnect,
  listSerialPorts,
  onData,
  onStatus,
  sendBytes,
  STATUS_EVENT,
} from "../mavlinkTransport";

beforeEach(() => {
  mockWindows("main");
});

afterEach(() => {
  clearMocks();
});

describe("mavlinkTransport", () => {
  it("listSerialPorts invokes list_serial_ports and returns the result", async () => {
    mockIPC((cmd) => {
      if (cmd === "list_serial_ports") return [{ name: "COM3", description: "USB Serial" }];
      throw new Error(`unexpected command: ${cmd}`);
    });

    await expect(listSerialPorts()).resolves.toEqual([{ name: "COM3", description: "USB Serial" }]);
  });

  it("connectSerial invokes connect_serial with the port name and baud rate", async () => {
    const invoked = vi.fn();
    mockIPC((cmd, payload) => {
      invoked(cmd, payload);
    });

    await connectSerial("COM3", 57600);

    expect(invoked).toHaveBeenCalledWith("connect_serial", { portName: "COM3", baudRate: 57600 });
  });

  it("connectUdp invokes connect_udp with the bind port", async () => {
    const invoked = vi.fn();
    mockIPC((cmd, payload) => {
      invoked(cmd, payload);
    });

    await connectUdp(14550);

    expect(invoked).toHaveBeenCalledWith("connect_udp", { bindPort: 14550 });
  });

  it("disconnect invokes disconnect", async () => {
    const invoked = vi.fn();
    mockIPC((cmd) => {
      invoked(cmd);
    });

    await disconnect();

    expect(invoked).toHaveBeenCalledWith("disconnect");
  });

  it("sendBytes invokes send_bytes with a plain number array", async () => {
    const invoked = vi.fn();
    mockIPC((cmd, payload) => {
      invoked(cmd, payload);
    });

    await sendBytes(new Uint8Array([1, 2, 3]));

    expect(invoked).toHaveBeenCalledWith("send_bytes", { bytes: [1, 2, 3] });
  });

  it("onData fires the callback with a Uint8Array when the backend emits the data event", async () => {
    mockIPC(() => {}, { shouldMockEvents: true });
    const received = vi.fn();

    await onData(received);
    await emit(DATA_EVENT, { bytes: [4, 5, 6] });

    expect(received).toHaveBeenCalledWith(new Uint8Array([4, 5, 6]));
  });

  it("onStatus fires the callback with the status payload when the backend emits the status event", async () => {
    mockIPC(() => {}, { shouldMockEvents: true });
    const received = vi.fn();

    await onStatus(received);
    await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });

    expect(received).toHaveBeenCalledWith({ kind: "connected", detail: "udp:0.0.0.0:14550" });
  });

  describe("Dev Mode (connectMock)", () => {
    // Deliberately no mockIPC/mockWindows setup in most of these - Dev Mode's whole point is
    // to work with no real Tauri backend present at all (a plain browser tab, or a desktop
    // build with no vehicle attached), so these tests prove that directly rather than assuming it.

    it("fires a connected status through onStatus with no Tauri backend involved", async () => {
      const received = vi.fn();
      await onStatus(received);

      await connectMock(MavType.FIXED_WING);
      await vi.waitFor(() => expect(received).toHaveBeenCalledWith({ kind: "connected", detail: "Dev mode (simulated vehicle)" }));

      await disconnect();
    });

    it("onData receives the simulated vehicle's own heartbeat bytes", async () => {
      const received = vi.fn();
      await onData(received);

      await connectMock(MavType.FIXED_WING);

      expect(received).toHaveBeenCalled(); // the mock vehicle sends its first heartbeat immediately
      const [bytes] = received.mock.calls[0] as [Uint8Array];
      expect(bytes[0]).toBe(0xfd); // MAVLink v2 start byte

      await disconnect();
    });

    it("sendBytes routes to the mock vehicle instead of invoking a real command", async () => {
      const invoked = vi.fn();
      mockIPC((cmd, payload) => invoked(cmd, payload));

      await connectMock(MavType.FIXED_WING);
      await sendBytes(new Uint8Array([1, 2, 3]));

      expect(invoked).not.toHaveBeenCalledWith("send_bytes", expect.anything());

      await disconnect();
    });

    it("disconnect while mocking stops the simulator and fires disconnected, without invoking the real command", async () => {
      const invoked = vi.fn();
      mockIPC((cmd, payload) => invoked(cmd, payload));
      const receivedStatus = vi.fn();
      await onStatus(receivedStatus);

      await connectMock(MavType.FIXED_WING);
      await vi.waitFor(() => expect(receivedStatus).toHaveBeenCalledWith({ kind: "connected", detail: "Dev mode (simulated vehicle)" }));

      await disconnect();

      expect(receivedStatus).toHaveBeenCalledWith({ kind: "disconnected" });
      expect(invoked).not.toHaveBeenCalledWith("disconnect");
    });

    it("connectSerial stops an active mock before making the real connection", async () => {
      const invoked = vi.fn();
      mockIPC((cmd, payload) => invoked(cmd, payload));

      await connectMock(MavType.FIXED_WING);
      invoked.mockClear();

      await connectSerial("COM3", 57600);
      expect(invoked).toHaveBeenCalledWith("connect_serial", { portName: "COM3", baudRate: 57600 });

      // The mock is gone now - sendBytes must go to the real backend, not be swallowed by it.
      invoked.mockClear();
      await sendBytes(new Uint8Array([9]));
      expect(invoked).toHaveBeenCalledWith("send_bytes", { bytes: [9] });

      await disconnect();
    });
  });
});
