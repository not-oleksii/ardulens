import type { MavlinkPacketMeta } from "../codec/codec";
import { encodePacket } from "../codec/codec";
import { x25Crc } from "../crc/crc";
import { MavParamType, ParamSet, ParamValue } from "../registry/registry";

const V2_HEADER_LENGTH = 10;
// param_value is always the first field (offset 0, 4 bytes) in both PARAM_VALUE and PARAM_SET.
const PARAM_VALUE_FIELD_OFFSET = 0;

/**
 * ArduPilot (and MAVLink's "byte-wise" parameter encoding in general) always transmits
 * PARAM_VALUE/PARAM_SET's `param_value` as a wire `float` regardless of the parameter's real
 * type - but for non-float types, that float slot doesn't hold a numeric cast of the value,
 * it holds the value's raw bytes *reinterpreted* as a float32 (the C equivalent of
 * `*(float*)&int_value`). Naively treating the wire float as the real value produces
 * nonsense (a tiny denormal) for anything but REAL32 params - this is a well-known MAVLink
 * GCS gotcha, and pymavlink/Mission Planner do this same bit-reinterpret round trip.
 *
 * Operates on the raw 32-bit pattern, not a JS `number` that already went through
 * `DataView.getFloat32()` - a negative int32/uint32 parameter value can easily have a bit
 * pattern that falls in float32's NaN range, and JS collapses *every* float32 NaN bit
 * pattern into a single canonical `NaN` the moment it's read as a float, destroying the
 * original bits before they could be reinterpreted. Read the bits as a plain uint32 instead
 * (see {@link readParamValueBits}) and pass that in here.
 */
export function paramWireBitsToValue(wireBits: number, type: MavParamType): number {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, wireBits, true);
  switch (type) {
    case MavParamType.REAL32:
      return view.getFloat32(0, true);
    case MavParamType.UINT8:
      return view.getUint8(0);
    case MavParamType.INT8:
      return view.getInt8(0);
    case MavParamType.UINT16:
      return view.getUint16(0, true);
    case MavParamType.INT16:
      return view.getInt16(0, true);
    case MavParamType.UINT32:
      return view.getUint32(0, true);
    case MavParamType.INT32:
      return view.getInt32(0, true);
    default:
      // REAL64/INT64/UINT64 aren't used by ArduPilot's parameter protocol in practice (the
      // wire float slot is only 4 bytes wide anyway, so an 8-byte type can't round-trip
      // through it) - fall back to the raw bit pattern as an unsigned integer.
      return wireBits;
  }
}

/** The inverse of {@link paramWireBitsToValue} - packs a real value into a raw 32-bit wire pattern. */
export function paramValueToWireBits(value: number, type: MavParamType): number {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  switch (type) {
    case MavParamType.REAL32:
      view.setFloat32(0, value, true);
      break;
    case MavParamType.UINT8:
      view.setUint8(0, value);
      break;
    case MavParamType.INT8:
      view.setInt8(0, value);
      break;
    case MavParamType.UINT16:
      view.setUint16(0, value, true);
      break;
    case MavParamType.INT16:
      view.setInt16(0, value, true);
      break;
    case MavParamType.UINT32:
      view.setUint32(0, value, true);
      break;
    case MavParamType.INT32:
      view.setInt32(0, value, true);
      break;
    default:
      view.setUint32(0, value, true);
  }
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
