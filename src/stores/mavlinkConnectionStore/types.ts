export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export interface MavlinkConnectionState {
  status: ConnectionStatus;
  detail: string | null;
  errorMessage: string | null;
  bytesReceived: number;
  bytesSent: number;
  setConnecting: () => void;
  setConnected: (detail: string) => void;
  setDisconnected: () => void;
  setError: (message: string) => void;
  addBytesReceived: (n: number) => void;
  addBytesSent: (n: number) => void;
  reset: () => void;
}
