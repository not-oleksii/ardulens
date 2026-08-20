import { describe, expect, it } from "vitest";
import { encodePayload } from "../../codec/codec";
import { x25Crc } from "../../crc/crc";
import { MavParamType, ParamSet, ParamValue } from "../../registry/registry";
import { buildParamSetPacket, buildParamValuePacket, paramValueToWireBits, paramWireBitsToValue, readParamValueBits } from "../paramValueCodec";

describe("paramWireBitsToValue", () => {
  it("interprets REAL32 bits as a float", () => {
    const bits = paramValueToWireBits(3.5, MavParamType.REAL32);
    expect(paramWireBitsToValue(bits, MavParamType.REAL32)).toBe(3.5);
  });

  it("rounds a float32-cast INT32 value back to the real integer", () => {
    // ArduPilot sends param_value as a numeric float32 cast (AP_Param::cast_to_float()) for
    // every non-REAL32 type, not a byte-wise reinterpret of the raw integer bits - confirmed
    // against a real vehicle (see paramValueCodec.ts's own doc comment for the full story).
    const bits = paramValueToWireBits(1000, MavParamType.INT32);
    expect(paramWireBitsToValue(bits, MavParamType.INT32)).toBe(1000);
  });

  it("rounds a negative INT32 value back correctly", () => {
    const bits = paramValueToWireBits(-5, MavParamType.INT32);
    expect(paramWireBitsToValue(bits, MavParamType.INT32)).toBe(-5);
  });

  it("rounds a UINT8 value back correctly", () => {
    const bits = paramValueToWireBits(200, MavParamType.UINT8);
    expect(paramWireBitsToValue(bits, MavParamType.UINT8)).toBe(200);
  });

  it("rounds an INT16 value back correctly", () => {
    const bits = paramValueToWireBits(-1234, MavParamType.INT16);
    expect(paramWireBitsToValue(bits, MavParamType.INT16)).toBe(-1234);
  });

  it("rounds a UINT32 value comfortably within float32's exact-integer range (2^24) back correctly", () => {
    const bits = paramValueToWireBits(4_000_000, MavParamType.UINT32);
    expect(paramWireBitsToValue(bits, MavParamType.UINT32)).toBe(4_000_000);
  });

  it("loses precision on a UINT32 value beyond float32's exact-integer range - inherent to ArduPilot's own wire format, not a decode bug", () => {
    // float32 only exactly represents integers whose significant bits fit in its 24-bit
    // mantissa - most large integers beyond ~16.7M don't (though some "round" ones, like exact
    // powers of two or multiples of one, still do). The real vehicle itself already sent this
    // rounded float, so no decode strategy can recover more than what's on the wire. This
    // asserts the real (imprecise) round-trip for a value that isn't mantissa-exact, rather
    // than a fabricated one.
    const bits = paramValueToWireBits(4_123_456_789, MavParamType.UINT32);
    const roundTripped = paramWireBitsToValue(bits, MavParamType.UINT32);
    expect(roundTripped).not.toBe(4_123_456_789);
    expect(Math.abs(roundTripped - 4_123_456_789)).toBeLessThan(1000);
  });
});

describe("paramValueToWireBits", () => {
  it("is the exact inverse of paramWireBitsToValue for every integer type within float32's exact-integer range", () => {
    const cases: Array<[number, MavParamType]> = [
      [1000, MavParamType.INT32],
      [-5, MavParamType.INT32],
      [200, MavParamType.UINT8],
      [-1234, MavParamType.INT16],
      [4_000_000, MavParamType.UINT32],
      [12345, MavParamType.UINT16],
      [-100, MavParamType.INT8],
    ];
    for (const [value, type] of cases) {
      const bits = paramValueToWireBits(value, type);
      expect(paramWireBitsToValue(bits, type)).toBe(value);
    }
  });

  it("round-trips a REAL32 value", () => {
    const bits = paramValueToWireBits(-12.75, MavParamType.REAL32);
    expect(paramWireBitsToValue(bits, MavParamType.REAL32)).toBe(-12.75);
  });
});

describe("readParamValueBits", () => {
  it("reads the raw bits from a decoded payload's first 4 bytes", () => {
    const msg = new ParamSet();
    msg.paramId = "TEST";
    msg.paramValue = 0;
    msg.paramType = MavParamType.INT32;
    const payload = encodePayload(msg);
    // Manually overwrite the first 4 bytes with a real float32(-5.0) bit pattern - simulating
    // what a real vehicle sends, since encodePayload's own generic float writer would collapse
    // a negative-looking raw bit pattern into a canonical NaN before we could inspect it.
    const bits = paramValueToWireBits(-5, MavParamType.INT32);
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    view.setUint32(0, bits, true);
    expect(readParamValueBits(payload)).toBe(bits);
  });
});

describe("buildParamSetPacket", () => {
  it("produces a packet whose payload carries the exact requested bit pattern and a valid CRC", () => {
    const msg = new ParamSet();
    msg.targetSystem = 1;
    msg.targetComponent = 1;
    msg.paramId = "TEST_PARAM";
    msg.paramType = MavParamType.INT32;
    msg.paramValue = 0;

    const wireBits = paramValueToWireBits(-5, MavParamType.INT32);
    const packet = buildParamSetPacket(msg, wireBits, { seq: 1, sysid: 255, compid: 190 });

    // Re-read the param_value field straight back out of the built packet's payload.
    const payload = packet.subarray(10, 10 + ParamSet.PAYLOAD_LENGTH);
    expect(readParamValueBits(payload)).toBe(wireBits);
    expect(paramWireBitsToValue(readParamValueBits(payload), MavParamType.INT32)).toBe(-5);

    // CRC must validate against the patched bytes, not the pre-patch placeholder.
    expect(packet[0]).toBe(0xfd); // v2 start byte
    const crcInput = packet.subarray(1, packet.length - 2);
    const expectedCrc = x25Crc(crcInput, ParamSet.MAGIC_NUMBER);
    const actualCrc = packet[packet.length - 2]! | (packet[packet.length - 1]! << 8);
    expect(actualCrc).toBe(expectedCrc);
  });
});

describe("buildParamValuePacket", () => {
  it("produces a packet whose payload carries the exact requested bit pattern and a valid CRC", () => {
    const msg = new ParamValue();
    msg.paramId = "TEST_PARAM";
    msg.paramType = MavParamType.INT16;
    msg.paramIndex = 3;
    msg.paramCount = 10;
    msg.paramValue = 0;

    const wireBits = paramValueToWireBits(-1234, MavParamType.INT16);
    const packet = buildParamValuePacket(msg, wireBits, { seq: 1, sysid: 1, compid: 1 });

    const payload = packet.subarray(10, 10 + ParamValue.PAYLOAD_LENGTH);
    expect(readParamValueBits(payload)).toBe(wireBits);
    expect(paramWireBitsToValue(readParamValueBits(payload), MavParamType.INT16)).toBe(-1234);

    const crcInput = packet.subarray(1, packet.length - 2);
    const expectedCrc = x25Crc(crcInput, ParamValue.MAGIC_NUMBER);
    const actualCrc = packet[packet.length - 2]! | (packet[packet.length - 1]! << 8);
    expect(actualCrc).toBe(expectedCrc);
  });
});
