import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { MavType } from "../../mavlink/registry/registry";
import { startMockVehicle, type MockVehicleHandle } from "./mockVehicleSimulator";
import type { SerialPortInfo, TransportStatus } from "./types";

// Also independently declared in app/src-tauri/src/transport.rs (DATA_EVENT/STATUS_EVENT) -
// that side can't import a TS constant, so the two must be kept in sync by hand.
export const DATA_EVENT = "mavlink-transport://data";
export const STATUS_EVENT = "mavlink-transport://status";

/**
 * True when running inside the Tauri desktop shell, false for a plain browser tab (the
 * `npm run start` / `run-web` build). Real serial/UDP connections only work under Tauri -
 * a browser tab has no OS-level serial or raw-socket access - so callers use this to gate
 * the live-vehicle connect UI and fall back to Dev Mode's simulated vehicle instead.
 */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// A local pub-sub bus that both onData/onStatus subscribers and the mock vehicle simulator
// go through - the real Tauri backend's events also get forwarded into this same bus (see
// onData/onStatus below), so a caller never needs to know whether it's ultimately hearing
// from a real vehicle or a simulated one.
const dataListeners = new Set<(bytes: Uint8Array) => void>();
const statusListeners = new Set<(status: TransportStatus) => void>();
let mockHandle: MockVehicleHandle | null = null;

function emitData(bytes: Uint8Array): void {
  dataListeners.forEach((cb) => cb(bytes));
}

function emitStatus(status: TransportStatus): void {
  statusListeners.forEach((cb) => cb(status));
}

function stopMock(): void {
  mockHandle?.stop();
  mockHandle = null;
}

export function listSerialPorts(): Promise<SerialPortInfo[]> {
  return invoke("list_serial_ports");
}

export function connectSerial(portName: string, baudRate: number): Promise<void> {
  stopMock();
  return invoke("connect_serial", { portName, baudRate });
}

export function connectUdp(bindPort: number): Promise<void> {
  stopMock();
  return invoke("connect_udp", { bindPort });
}

/**
 * Starts an in-process simulated vehicle instead of a real connection - lets the whole app
 * (telemetry, parameters, compass cal, servo test) be exercised without any real hardware,
 * SITL, or even a Tauri backend. Fires a "connected" status through the same listener bus a
 * real connect would, so the rest of the app doesn't need to know the difference.
 *
 * `copterFrame` (Copter vehicle types only) picks which of frameDiagrams.ts's 6 verified
 * frame class/type combos the simulator starts seeded as - defaults to Quad X if omitted.
 */
export function connectMock(vehicleType: MavType, copterFrame?: { frameClass: number; frameType: number }): Promise<void> {
  stopMock();
  mockHandle = startMockVehicle(vehicleType, emitData, copterFrame);
  // Deferred so callers that `await connectMock(...)` then immediately subscribe (or that
  // rely on the connecting->connected transition happening asynchronously, like a real
  // connect would) see the same ordering they'd see for a real connection.
  queueMicrotask(() => emitStatus({ kind: "connected", detail: "Dev mode (simulated vehicle)" }));
  return Promise.resolve();
}

export async function disconnect(): Promise<void> {
  if (mockHandle) {
    stopMock();
    emitStatus({ kind: "disconnected" });
    return;
  }
  return invoke("disconnect");
}

export function sendBytes(bytes: Uint8Array): Promise<void> {
  if (mockHandle) {
    mockHandle.handleAppBytes(bytes);
    return Promise.resolve();
  }
  return invoke("send_bytes", { bytes: Array.from(bytes) });
}

export async function onData(cb: (bytes: Uint8Array) => void): Promise<UnlistenFn> {
  dataListeners.add(cb);
  let tauriUnlisten: UnlistenFn | null = null;
  try {
    tauriUnlisten = await listen<{ bytes: number[] }>(DATA_EVENT, (event) => cb(new Uint8Array(event.payload.bytes)));
  } catch {
    // No Tauri backend available (e.g. a plain browser tab, or Dev Mode) - the local bus
    // above still works for the mock vehicle, so this is not a real failure to surface.
  }
  return () => {
    dataListeners.delete(cb);
    tauriUnlisten?.();
  };
}

export async function onStatus(cb: (status: TransportStatus) => void): Promise<UnlistenFn> {
  statusListeners.add(cb);
  let tauriUnlisten: UnlistenFn | null = null;
  try {
    tauriUnlisten = await listen<TransportStatus>(STATUS_EVENT, (event) => cb(event.payload));
  } catch {
    // See onData - no Tauri backend is expected and handled gracefully, not an error.
  }
  return () => {
    statusListeners.delete(cb);
    tauriUnlisten?.();
  };
}

export type { SerialPortInfo, TransportStatus };
