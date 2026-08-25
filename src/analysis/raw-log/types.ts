export interface ModeSegment {
  startMs: number;
  endMs: number;
  mode: number;
  label: string;
}

export interface ParamDef {
  /** Stable key used throughout the UI/state, e.g. "BAT.Volt" or "telemetry.voltage". */
  key: string;
  /** Human-readable label shown in the parameter tree and chart legend. */
  label: string;
}

export interface ParamCategory {
  /** i18n key under graphs.categories.<key>; also used as a stable React key. */
  key: string;
  params: ParamDef[];
}

export interface RawLogPoint {
  t: number;
  v: number;
}

export interface RawLog {
  fmt: "bin" | "skylog" | "tlog";
  timeRangeMs: [number, number];
  modeSegments: ModeSegment[];
  categories: ParamCategory[];
  series: Record<string, RawLogPoint[]>;
}

export interface RawLogError {
  error: string;
}

export interface RawLogInfo {
  info: string;
}

export type RawLogResult = RawLog | RawLogError | RawLogInfo;

export function isRawLog(r: RawLogResult): r is RawLog {
  return "fmt" in r;
}

export function isRawLogError(r: RawLogResult): r is RawLogError {
  return "error" in r;
}

export function isRawLogInfo(r: RawLogResult): r is RawLogInfo {
  return "info" in r;
}
