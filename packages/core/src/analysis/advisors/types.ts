import type { Flight } from "../../types.js";

export type Severity = "info" | "warning" | "critical";

export interface Finding {
  id: string;
  severity: Severity;
  message: string;
  /** Sample timestamp the finding relates to, if any (same unit as Sample.t). */
  at?: number;
}

export type Advisor = (flight: Flight) => Finding[];
