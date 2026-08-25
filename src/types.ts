export interface Sample {
  t: number;
  voltage?: number;
  current?: number;
  airspeed?: number;
  throttle?: number;
  alt?: number;
  lat?: number;
  lon?: number;
  mode?: number;
}

export type LogFormat = "skylog" | "bin" | "tlog";

export interface TrackStats {
  maxd: number | null;
  path: number | null;
  removed: number;
}

export interface Flight {
  board: string;
  timeReliable: boolean;
  fmt: LogFormat;
  samples: Sample[];
  /** Lazily computed and cached by trackStats(); absent until first call. */
  __t?: TrackStats;
}

export interface ParsedError {
  error: string;
}

export interface ParsedInfo {
  info: string;
}

export interface ParsedFlights {
  flights: Flight[];
  boards: string[];
  fmt: LogFormat;
}

export type ParseResult = ParsedFlights | ParsedError | ParsedInfo;

export function isParsedFlights(r: ParseResult): r is ParsedFlights {
  return "flights" in r;
}

export function isParsedError(r: ParseResult): r is ParsedError {
  return "error" in r;
}

export function isParsedInfo(r: ParseResult): r is ParsedInfo {
  return "info" in r;
}
