import { create } from "zustand";
import type { MavlinkConnectionState } from "./types";

export const useMavlinkConnectionStore = create<MavlinkConnectionState>((set) => ({
  status: "idle",
  detail: null,
  errorMessage: null,
  bytesReceived: 0,
  bytesSent: 0,
  setConnecting: () => set({ status: "connecting", errorMessage: null }),
  setConnected: (detail) => set({ status: "connected", detail, errorMessage: null }),
  setDisconnected: () => set({ status: "idle", detail: null }),
  setError: (message) => set({ status: "error", errorMessage: message }),
  addBytesReceived: (n) => set((s) => ({ bytesReceived: s.bytesReceived + n })),
  addBytesSent: (n) => set((s) => ({ bytesSent: s.bytesSent + n })),
  reset: () => set({ status: "idle", detail: null, errorMessage: null, bytesReceived: 0, bytesSent: 0 }),
}));
