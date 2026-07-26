import type { Flight } from "../../types";

export interface Metric {
  h: string;
  fn: (f: Flight) => string;
  manualIfBlank?: boolean;
}

export interface ComputedRow {
  row: string[];
  ground: boolean;
  manualCols: number[];
}
