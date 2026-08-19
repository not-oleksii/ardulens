import type { MavSeverity } from "../../mavlink/registry/registry";

export interface StatusTextEntry {
  severity: MavSeverity;
  text: string;
  receivedAt: number;
}

export interface MavlinkStatusTextState {
  /** Most recent first, capped at MAX_MESSAGES (see mavlinkStatusTextStore.ts) - a growing
   *  log, not a single current-value snapshot, unlike the rest of mavlinkTelemetryStore. */
  messages: StatusTextEntry[];
  addMessage: (entry: StatusTextEntry) => void;
  reset: () => void;
}
