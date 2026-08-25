import type { MavLinkData } from "mavlink-mappings/dist/lib/mavlink";
import { encodePacket, type MavlinkPacketMeta } from "../../mavlink/codec/codec";

/**
 * Minimal real .tlog buffer builder used only by tests - an 8-byte big-endian
 * microsecond-since-epoch timestamp immediately followed by one complete raw MAVLink packet,
 * repeated per message, matching the real format tlog.ts/telemetryRecorder.ts read and write
 * (confirmed against pymavlink's mavutil.mavlogfile and Mission Planner's own SaveToTlog - see
 * tlog.ts's own comment).
 */
export class TlogBuilder {
  private chunks: Uint8Array[] = [];

  addMessage(msg: MavLinkData, epochMs: number, meta: MavlinkPacketMeta): this {
    const timestamp = new Uint8Array(8);
    new DataView(timestamp.buffer).setBigUint64(0, BigInt(Math.round(epochMs * 1000)), false);
    this.chunks.push(timestamp, encodePacket(msg, meta));
    return this;
  }

  build(): ArrayBuffer {
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out.buffer;
  }
}
