import type { MavLinkData } from "mavlink-mappings/dist/lib/mavlink";
import { decodeMessage } from "../codec/codec";
import { x25Crc } from "../crc/crc";
import { MAVLINK_REGISTRY } from "../registry/registry";

export interface DecodedMavlinkPacket {
  msgId: number;
  sysid: number;
  compid: number;
  seq: number;
  message: MavLinkData;
  /**
   * The packet's raw (possibly v2-truncated) payload bytes, alongside the already-decoded
   * `message`. Most callers only need `message` - this exists for the rare field that the
   * generic decoder's normal numeric conversion loses information on, e.g. PARAM_VALUE's
   * `param_value`, which is wire-encoded as a float but for non-float parameter types holds
   * a bit-reinterpreted integer; decoding it via the generic float path collapses any
   * NaN-shaped bit pattern into a single canonical NaN, so that field must be re-read
   * directly from these raw bytes instead of trusting `message.paramValue`.
   */
  payload: Uint8Array;
  /** The packet's complete raw bytes (header through CRC/signature) - an independent copy
   *  (not a view into MavlinkFramer's internal reassembly buffer), safe to hold onto for as
   *  long as needed (e.g. telemetryRecorder.ts writing a .tlog). Most callers don't need this
   *  - `message`/`payload` cover the normal case. */
  raw: Uint8Array;
}

const V1_START_BYTE = 0xfe;
const V2_START_BYTE = 0xfd;
const V1_HEADER_LENGTH = 6; // STX,len,seq,sysid,compid,msgid
const V2_HEADER_LENGTH = 10; // STX,len,incompat,compat,seq,sysid,compid,msgid(3)
const CRC_LENGTH = 2;
const V2_SIGNATURE_LENGTH = 13;
const V2_SIGNED_FLAG = 0x01;

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

export type PacketDecodeResult =
  | { kind: "ok"; packet: DecodedMavlinkPacket; length: number }
  | { kind: "incomplete" } // not enough bytes yet to tell - wait for more
  | { kind: "invalid" }; // buf[0] isn't a real packet start after all - caller should resync

/**
 * Attempts to decode one complete, CRC-validated MAVLink packet starting at `buf[0]` (the
 * caller owns finding/validating that `buf[0]` is a plausible start byte - this function
 * doesn't scan). Pure and stateless - the shared decode core behind both `MavlinkFramer`'s
 * streaming reassembly (buf[0] is a live-stream resync candidate, `incomplete` means "wait for
 * more bytes") and tlog.ts's offline `.tlog` walker (buf[0] is always the real, fixed-layout
 * start of the next record's packet, so `incomplete`/`invalid` there just means "stop, this is
 * the last complete record" rather than something to resync past).
 */
export function decodeOnePacket(buf: Uint8Array): PacketDecodeResult {
  const isV2 = buf[0] === V2_START_BYTE;
  if (!isV2 && buf[0] !== V1_START_BYTE) return { kind: "invalid" };

  const headerLength = isV2 ? V2_HEADER_LENGTH : V1_HEADER_LENGTH;
  if (buf.length < headerLength) return { kind: "incomplete" };

  // Look up the message id (and therefore whether we can even validate this packet's CRC)
  // as soon as the header is available - *before* trusting the length byte to decide how
  // much more data to wait for. Otherwise a false-positive start byte inside unrelated
  // garbage can compute an implausible total length from noise and stall forever waiting
  // for bytes that will never arrive, instead of resyncing immediately.
  const msgId = isV2 ? buf[7]! | (buf[8]! << 8) | (buf[9]! << 16) : buf[5]!;
  const ctor = MAVLINK_REGISTRY[msgId];
  const payloadLength = buf[1]!;
  // A real packet's payload can be *shorter* than PAYLOAD_LENGTH (MAVLink 2 allows trailing
  // zero bytes to be stripped) but never longer - a claimed length above that is already
  // proof this isn't a real packet of this message id, so reject it up front rather than
  // trusting it to compute how many more bytes to wait for (a bogus but "plausible" claimed
  // length on a message id that happens to be registered could otherwise stall the parser
  // waiting for bytes that will never arrive).
  if (!ctor || payloadLength > ctor.PAYLOAD_LENGTH) return { kind: "invalid" };

  const incompatFlags = isV2 ? buf[2]! : 0;
  const signed = isV2 && (incompatFlags & V2_SIGNED_FLAG) !== 0;
  const totalLength = headerLength + payloadLength + CRC_LENGTH + (signed ? V2_SIGNATURE_LENGTH : 0);
  if (buf.length < totalLength) return { kind: "incomplete" };

  const crcInput = buf.subarray(1, headerLength + payloadLength);
  const expectedCrc = x25Crc(crcInput, ctor.MAGIC_NUMBER);
  const actualCrc = buf[headerLength + payloadLength]! | (buf[headerLength + payloadLength + 1]! << 8);
  if (expectedCrc !== actualCrc) return { kind: "invalid" };

  const payload = buf.subarray(headerLength, headerLength + payloadLength);
  const packet: DecodedMavlinkPacket = {
    msgId,
    seq: isV2 ? buf[4]! : buf[2]!,
    sysid: isV2 ? buf[5]! : buf[3]!,
    compid: isV2 ? buf[6]! : buf[4]!,
    message: decodeMessage(ctor, payload),
    payload,
    // An independent copy, not a view into the caller's own (possibly reused/mutated)
    // buffer - safe for a caller to hold onto indefinitely (e.g. telemetryRecorder.ts
    // accumulating raw packets for a whole session).
    raw: buf.slice(0, totalLength),
  };
  return { kind: "ok", packet, length: totalLength };
}

/**
 * Reassembles a raw byte stream (arriving in arbitrary-sized chunks from serial/UDP) into
 * complete, CRC-validated MAVLink packets. Bytes that don't add up to a valid, known packet
 * (garbage, a corrupted packet, or a message id outside our registry) are discarded one byte
 * at a time rather than trusted at face value - a bogus length byte must never be allowed to
 * desync the stream from real packets that follow it.
 */
export class MavlinkFramer {
  private buffer: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): DecodedMavlinkPacket[] {
    this.buffer = concat(this.buffer, chunk);
    const packets: DecodedMavlinkPacket[] = [];

    while (this.buffer.length > 0) {
      const start = this.findStart();
      if (start === -1) {
        this.buffer = new Uint8Array(0);
        break;
      }
      if (start > 0) {
        this.buffer = this.buffer.subarray(start);
      }

      const result = decodeOnePacket(this.buffer);
      if (result.kind === "incomplete") break;
      if (result.kind === "invalid") {
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      packets.push(result.packet);
      this.buffer = this.buffer.subarray(result.length);
    }

    return packets;
  }

  private findStart(): number {
    for (let i = 0; i < this.buffer.length; i++) {
      const byte = this.buffer[i]!;
      if (byte === V1_START_BYTE || byte === V2_START_BYTE) return i;
    }
    return -1;
  }
}
