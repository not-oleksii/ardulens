import type { MavlinkPacketMeta } from "../codec/codec";
import { encodePacket } from "../codec/codec";
import { x25Crc } from "../crc/crc";
import { MavParamType, ParamSet, ParamValue } from "../registry/registry";

const V2_HEADER_LENGTH = 10;
// param_value is always the first field (offset 0, 4 bytes) in both PARAM_VALUE and PARAM_SET.
const PARAM_VALUE_FIELD_OFFSET = 0;

/**
 * ArduPilot always transmits PARAM_VALUE/PARAM_SET's `param_value` as a genuine numeric float32
 * cast of the parameter's real value, for every parameter type - not a byte-wise reinterpret of
 * the integer's raw bits (`*(float*)&int_value`). This is ArduPilot's own real behavior
 * (AP_Param::cast_to_float(), used by every send_parameter() call in the firmware), confirmed
 * against a real vehicle: ArduLens previously assumed the byte-wise convention (a real, but
 * different, ambiguity that exists elsewhere in the wider MAVLink ecosystem), which decoded a
 * real OSD1_CHAN_MAX of 2100 as 16384, OSD1_CHAN_MIN of 900 as 0, and RC1_MIN of 1100 as -32768 -
 * each exactly the low bytes of that value's real float32 encoding misread as a raw integer,
 * while Mission Planner (which decodes correctly) showed the real numbers for the same vehicle.
 *
 * Integer types are recovered by rounding the float back to the nearest integer - lossless for
 * every value ArduPilot's own parameter types realistically hold, since float32 represents every
 * integer up to 2^24 exactly. INT32/UINT32 parameters near the extreme end of their range (tens
 * of millions+) are the one case where this can't be exact - but that precision loss happens at
 * the source (the real vehicle already sent the rounded float), not in this decode step, so no
 * decode strategy could recover more than what actually arrived on the wire.
 */
export function paramWireBitsToValue(wireBits: number, type: MavParamType): number {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, wireBits, true);
  const asFloat = view.getFloat32(0, true);
  return type === MavParamType.REAL32 ? asFloat : Math.round(asFloat);
}

/** The inverse of {@link paramWireBitsToValue} - packs a real value into a raw 32-bit wire
 *  pattern by casting it to float32, matching ArduPilot's own AP_Param::cast_to_float(). */
export function paramValueToWireBits(value: number, _type: MavParamType): number {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setFloat32(0, value, true);
  return view.getUint32(0, true);
}

/** Raw little-endian uint32 read of a PARAM_VALUE/PARAM_SET payload's param_value field. */
export function readParamValueBits(payload: Uint8Array): number {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return view.getUint32(PARAM_VALUE_FIELD_OFFSET, true);
}

/**
 * Builds a PARAM_SET packet with param_value set to an exact raw bit pattern, sidestepping
 * the same NaN-canonicalization hazard as decoding (in reverse): `encodePacket()`'s generic
 * float writer would collapse any NaN-shaped `number` we handed it into one canonical NaN
 * bit pattern, corrupting whatever real negative integer that value was supposed to encode.
 * Encodes normally first (gets target_system/target_component/param_id/param_type right - a
 * dummy 0 in `msg.paramValue` is fine, it's about to be overwritten), then patches the
 * payload's first 4 bytes directly and recomputes the CRC over the modified packet.
 */
export function buildParamSetPacket(msg: ParamSet, wireBits: number, meta: MavlinkPacketMeta): Uint8Array {
  const packet = encodePacket(msg, meta);
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  view.setUint32(V2_HEADER_LENGTH + PARAM_VALUE_FIELD_OFFSET, wireBits, true);

  const crcInput = packet.subarray(1, packet.length - 2);
  const crc = x25Crc(crcInput, ParamSet.MAGIC_NUMBER);
  view.setUint8(packet.length - 2, crc & 0xff);
  view.setUint8(packet.length - 1, (crc >> 8) & 0xff);
  return packet;
}

/** Same idea as {@link buildParamSetPacket}, for encoding a PARAM_VALUE (e.g. by the mock
 *  vehicle simulator, which needs to send real byte-wise-encoded parameter responses back to
 *  the app - the same hazard applies since PARAM_VALUE's param_value field has the identical
 *  byte-wise encoding as PARAM_SET's). */
export function buildParamValuePacket(msg: ParamValue, wireBits: number, meta: MavlinkPacketMeta): Uint8Array {
  const packet = encodePacket(msg, meta);
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  view.setUint32(V2_HEADER_LENGTH + PARAM_VALUE_FIELD_OFFSET, wireBits, true);

  const crcInput = packet.subarray(1, packet.length - 2);
  const crc = x25Crc(crcInput, ParamValue.MAGIC_NUMBER);
  view.setUint8(packet.length - 2, crc & 0xff);
  view.setUint8(packet.length - 1, (crc >> 8) & 0xff);
  return packet;
}
