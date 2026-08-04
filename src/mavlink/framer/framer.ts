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

      const isV2 = this.buffer[0] === V2_START_BYTE;
      const headerLength = isV2 ? V2_HEADER_LENGTH : V1_HEADER_LENGTH;
      if (this.buffer.length < headerLength) break; // wait for more data

      // Look up the message id (and therefore whether we can even validate this packet's
      // CRC) as soon as the header is available - *before* trusting the length byte to
      // decide how much more data to wait for. Otherwise a false-positive start byte inside
      // unrelated garbage can compute an implausible total length from noise and stall
      // forever waiting for bytes that will never arrive, instead of resyncing immediately.
      const msgId = isV2 ? this.buffer[7]! | (this.buffer[8]! << 8) | (this.buffer[9]! << 16) : this.buffer[5]!;
      const ctor = MAVLINK_REGISTRY[msgId];
      const payloadLength = this.buffer[1]!;
      // A real packet's payload can be *shorter* than PAYLOAD_LENGTH (MAVLink 2 allows
      // trailing zero bytes to be stripped) but never longer - a claimed length above that
      // is already proof this isn't a real packet of this message id, so reject it up front
      // rather than trusting it to compute how many more bytes to wait for (a bogus but
      // "plausible" claimed length on a message id that happens to be registered could
      // otherwise stall the parser waiting for bytes that will never arrive).
      if (!ctor || payloadLength > ctor.PAYLOAD_LENGTH) {
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      const incompatFlags = isV2 ? this.buffer[2]! : 0;
      const signed = isV2 && (incompatFlags & V2_SIGNED_FLAG) !== 0;
      const totalLength = headerLength + payloadLength + CRC_LENGTH + (signed ? V2_SIGNATURE_LENGTH : 0);
      if (this.buffer.length < totalLength) break; // wait for more data

      const crcInput = this.buffer.subarray(1, headerLength + payloadLength);
      const expectedCrc = x25Crc(crcInput, ctor.MAGIC_NUMBER);
      const actualCrc = this.buffer[headerLength + payloadLength]! | (this.buffer[headerLength + payloadLength + 1]! << 8);
      if (expectedCrc !== actualCrc) {
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      const payload = this.buffer.subarray(headerLength, headerLength + payloadLength);
      packets.push({
        msgId,
        seq: isV2 ? this.buffer[4]! : this.buffer[2]!,
        sysid: isV2 ? this.buffer[5]! : this.buffer[3]!,
        compid: isV2 ? this.buffer[6]! : this.buffer[4]!,
        message: decodeMessage(ctor, payload),
      });
      this.buffer = this.buffer.subarray(totalLength);
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
