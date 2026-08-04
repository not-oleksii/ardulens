import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { SerialPortInfo, TransportStatus } from "./types";

const DATA_EVENT = "mavlink-transport://data";
const STATUS_EVENT = "mavlink-transport://status";

export function listSerialPorts(): Promise<SerialPortInfo[]> {
  return invoke("list_serial_ports");
}

export function connectSerial(portName: string, baudRate: number): Promise<void> {
  return invoke("connect_serial", { portName, baudRate });
}

export function connectUdp(bindPort: number): Promise<void> {
  return invoke("connect_udp", { bindPort });
}

export function disconnect(): Promise<void> {
  return invoke("disconnect");
}

export function sendBytes(bytes: Uint8Array): Promise<void> {
  return invoke("send_bytes", { bytes: Array.from(bytes) });
}

export function onData(cb: (bytes: Uint8Array) => void): Promise<UnlistenFn> {
  return listen<{ bytes: number[] }>(DATA_EVENT, (event) => {
    cb(new Uint8Array(event.payload.bytes));
  });
}

export function onStatus(cb: (status: TransportStatus) => void): Promise<UnlistenFn> {
  return listen<TransportStatus>(STATUS_EVENT, (event) => {
    cb(event.payload);
  });
}

export type { SerialPortInfo, TransportStatus };
