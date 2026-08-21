import { create } from "zustand";
import type { DataflashLogEntry, MavlinkDataflashLogState } from "./types";

const INITIAL: Pick<
  MavlinkDataflashLogState,
  | "entries"
  | "numLogsExpected"
  | "listRequested"
  | "downloadPhase"
  | "downloadId"
  | "downloadTotalBytes"
  | "downloadBytesReceived"
  | "downloadedFile"
  | "downloadError"
> = {
  entries: [],
  numLogsExpected: null,
  listRequested: false,
  downloadPhase: "idle",
  downloadId: null,
  downloadTotalBytes: null,
  downloadBytesReceived: 0,
  downloadedFile: null,
  downloadError: null,
};

export const useMavlinkDataflashLogStore = create<MavlinkDataflashLogState>((set) => ({
  ...INITIAL,
  requestList: () => set({ entries: [], numLogsExpected: null, listRequested: true }),
  upsertEntry: (entry: DataflashLogEntry) =>
    set((s) => ({
      entries: [...s.entries.filter((e) => e.id !== entry.id), entry].sort((a, b) => a.id - b.id),
    })),
  setNumLogsExpected: (numLogsExpected) => set({ numLogsExpected }),
  startDownload: (id, totalBytes) =>
    set({
      downloadPhase: "downloading",
      downloadId: id,
      downloadTotalBytes: totalBytes,
      downloadBytesReceived: 0,
      downloadedFile: null,
      downloadError: null,
    }),
  setDownloadProgress: (bytesReceived) => set({ downloadBytesReceived: bytesReceived }),
  setDownloadDone: (file) => set({ downloadPhase: "done", downloadedFile: file }),
  setDownloadError: (error) => set({ downloadPhase: "error", downloadError: error }),
  reset: () => set({ ...INITIAL }),
}));
