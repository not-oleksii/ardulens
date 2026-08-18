export type ParamDefaultsPhase = "idle" | "opening" | "downloading" | "done" | "error";

export interface MavlinkParamDefaultsState {
  phase: ParamDefaultsPhase;
  /** Bytes of the packed param.pck file received so far via burst-read chunks. */
  bytesReceived: number;
  /** The file's real size in bytes, from the OPEN_FILE_RO ack - null until that ack arrives. */
  totalBytes: number | null;
  /** name -> default value, populated once the whole file is downloaded and unpacked. Only
   *  contains entries ArduPilot actually included (it omits a param entirely when its default
   *  equals its current value), so a missing key means "no known override," not "zero." */
  defaults: Record<string, number> | null;
  error: string | null;
  start: () => void;
  setOpened: (totalBytes: number) => void;
  setProgress: (bytesReceived: number) => void;
  setDone: (defaults: Record<string, number>) => void;
  setError: (error: string) => void;
  reset: () => void;
}
