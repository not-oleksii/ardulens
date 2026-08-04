import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectSerial,
  connectUdp,
  disconnect,
  listSerialPorts,
  onData,
  onStatus,
  sendBytes,
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
    await emit("mavlink-transport://data", { bytes: [4, 5, 6] });

    expect(received).toHaveBeenCalledWith(new Uint8Array([4, 5, 6]));
  });

  it("onStatus fires the callback with the status payload when the backend emits the status event", async () => {
    mockIPC(() => {}, { shouldMockEvents: true });
    const received = vi.fn();

    await onStatus(received);
    await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });

    expect(received).toHaveBeenCalledWith({ kind: "connected", detail: "udp:0.0.0.0:14550" });
  });
});
