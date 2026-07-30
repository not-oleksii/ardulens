import type { Flight } from "../../types";

export type Severity = "info" | "warning" | "critical";

export interface Finding {
  id: string;
  severity: Severity;
  /** i18n key under "findings.<key>" - advisors never render text directly, so
   *  findings translate correctly regardless of which page surfaces them. */
  messageKey: string;
  /** Interpolation values for messageKey (i18next {{param}} placeholders). */
  params?: Record<string, string | number>;
  /** Sample timestamp the finding relates to, if any (same unit as Sample.t). */
  at?: number;
}

export type Advisor = (flight: Flight) => Finding[];
