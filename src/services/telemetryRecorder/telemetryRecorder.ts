import { MavlinkFramer } from "../../mavlink/framer/framer";
import { onData, onSent } from "../mavlinkTransport/mavlinkTransport";

// Matches tlog.ts's own read-side comment: 8-byte big-endian microsecond-since-Unix-epoch
// timestamp immediately followed by one complete raw MAVLink packet, per record.
const TIMESTAMP_LENGTH = 8;

function timestampBytesFor(epochMs: number): Uint8Array {
  const bytes = new Uint8Array(TIMESTAMP_LENGTH);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(Math.round(epochMs * 1000)), false);
  return bytes;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export interface TelemetryRecorderHandle {
  /** Live packet/byte counters - polled by the UI (see ArduPilotSetupView.tsx's own 1Hz-tick
   *  convention, e.g. the MAVLink Inspector's Hz recompute) rather than pushed, since a
   *  per-packet React re-render at full telemetry rate would be wasteful. */
  getStats: () => { packetCount: number; byteCount: number };
  /** Stops recording and returns the accumulated .tlog bytes - a real, standard file (see
   *  tlog.ts), not an ArduLens-specific format. Safe to call at most once. */
  stop: () => Uint8Array;
}

/**
 * Records a live MAVLink session (both directions - vehicle->GCS via onData, GCS->vehicle via
 * onSent) into a real, standard .tlog byte stream, interoperable with Mission Planner/
 * QGroundControl/pymavlink and readable by this app's own tlog.ts (which feeds it straight
 * into the same Logs/Graphs pipeline a dataflash .bin uses). Two independent MavlinkFramer
 * instances delineate packet boundaries for correct per-packet timestamping - onData's own
 * chunks aren't necessarily packet-aligned (one serial/UDP read can contain multiple packets,
 * or split one across two reads), and the incoming/outgoing byte streams are logically
 * independent so they get their own resync state rather than sharing one.
 */
export function startTelemetryRecording(): TelemetryRecorderHandle {
  const incomingFramer = new MavlinkFramer();
  const outgoingFramer = new MavlinkFramer();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  let packetCount = 0;
  let stopped = false;

  function record(framer: MavlinkFramer, bytes: Uint8Array): void {
    if (stopped) return;
    for (const packet of framer.push(bytes)) {
      const timestamp = timestampBytesFor(Date.now());
      chunks.push(timestamp, packet.raw);
      byteCount += timestamp.length + packet.raw.length;
      packetCount++;
    }
  }

  // onData is async (it awaits Tauri's own event-listener registration) - subscribing via
  // .then() rather than awaiting here means no incoming bytes are missed between calling
  // this function and the subscription actually landing, matching the same
  // subscribe-now-cleanup-later shape ArduPilotSetupView.tsx's own persistent onData/onStatus
  // effect already uses. onSent is a plain synchronous local Set (see mavlinkTransport.ts's
  // own comment on why), so no such race exists on the outgoing side.
  let unlistenData: (() => void) | undefined;
  void onData((bytes) => record(incomingFramer, bytes)).then((unlisten) => {
    if (stopped) unlisten();
    else unlistenData = unlisten;
  });
  const unlistenSent = onSent((bytes) => record(outgoingFramer, bytes));

  return {
    getStats: () => ({ packetCount, byteCount }),
    stop: () => {
      stopped = true;
      unlistenData?.();
      unlistenSent();
      return concatChunks(chunks);
    },
  };
}
