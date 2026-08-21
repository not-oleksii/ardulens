export type DataflashDownloadPhase = "idle" | "downloading" | "done" | "error";

/** One row from LOG_ENTRY. */
export interface DataflashLogEntry {
  id: number;
  /** Unix seconds, per LOG_ENTRY's own field - 0 for a log old enough (or a firmware build)
   *  that never recorded real wall-clock time. */
  timeUtc: number;
  sizeBytes: number;
}

export interface MavlinkDataflashLogState {
  entries: DataflashLogEntry[];
  /** LOG_ENTRY's own num_logs field, once at least one entry has arrived - how many entries the
   *  vehicle says it has in total, shown as "X of Y" while the list is still filling in. */
  numLogsExpected: number | null;
  listRequested: boolean;
  downloadPhase: DataflashDownloadPhase;
  downloadId: number | null;
  downloadTotalBytes: number | null;
  downloadBytesReceived: number;
  /** The fully assembled log file, populated once downloadPhase is "done". */
  downloadedFile: Uint8Array | null;
  downloadError: string | null;
  requestList: () => void;
  upsertEntry: (entry: DataflashLogEntry) => void;
  setNumLogsExpected: (numLogsExpected: number) => void;
  startDownload: (id: number, totalBytes: number) => void;
  setDownloadProgress: (bytesReceived: number) => void;
  setDownloadDone: (file: Uint8Array) => void;
  setDownloadError: (error: string) => void;
  reset: () => void;
}
