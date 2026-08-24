import type { MavLinkData } from "mavlink-mappings/dist/lib/mavlink";

/** One row of the MAVLink Inspector's live message list - one per distinct msgId seen since
 *  connecting, not one per packet (the inspector shows the latest state of each message type,
 *  like Mission Planner's own Msg Inspector / QGroundControl's MAVLink Inspector, not a scrolling
 *  packet log). */
export interface InspectorEntry {
  msgId: number;
  /** The message's canonical name (e.g. "HEARTBEAT", "GLOBAL_POSITION_INT"), resolved from
   *  MAVLINK_REGISTRY at record time so it survives even if this entry's own `lastMessage`
   *  instance somehow lacked a usable constructor identity (e.g. after minification). */
  name: string;
  count: number;
  /** Messages/sec, recomputed once per second (see ArduPilotSetupView.tsx's tickRates effect)
   *  from the count delta since the previous tick - not an average since connection started, so
   *  a stalled stream visibly drops to 0 rather than staying pinned at its historical average. */
  hz: number;
  /** Internal bookkeeping for the next tick's delta - not meant to be read by the UI. */
  countAtLastTick: number;
  lastMessage: MavLinkData;
  lastReceivedAt: number;
}

export interface MavlinkInspectorState {
  entries: Record<number, InspectorEntry>;
  recordPacket: (msgId: number, name: string, message: MavLinkData, receivedAt: number) => void;
  tickRates: () => void;
  reset: () => void;
}
