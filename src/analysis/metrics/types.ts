import type { Flight } from "../../types";

export interface Metric {
  /** Ukrainian fallback label - used as-is by non-UI code that doesn't go through i18next. */
  h: string;
  /** Translation key under the "metrics" i18n namespace; UI code should use t(`metrics.${key}`). */
  key: string;
  fn: (f: Flight) => string;
  manualIfBlank?: boolean;
  /**
   * True for metrics that are derived/estimated rather than read straight from
   * telemetry fields - either from the GPS track after spoofing/teleport
   * rejection (cleanTrack), or computed by integrating samples over time.
   * Either way, the result may differ from the true value.
   */
  approximate?: boolean;
  /** False to leave this metric out of the table's default column selection (still toggleable). */
  defaultVisible?: boolean;
}

export interface ComputedRow {
  row: string[];
  ground: boolean;
  manualCols: number[];
}
