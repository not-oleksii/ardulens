export interface SerialPortInfo {
  name: string;
  description: string | null;
}

export type TransportStatus =
  | { kind: "connected"; detail: string }
  | { kind: "disconnected" }
  | { kind: "error"; message: string };
