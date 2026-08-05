import { describe, expect, it } from "vitest";
import { encodePayload } from "../../codec/codec";
import { x25Crc } from "../../crc/crc";
import { MavParamType, ParamSet, ParamValue } from "../../registry/registry";
import { buildParamSetPacket, buildParamValuePacket, paramValueToWireBits, paramWireBitsToValue, readParamValueBits } from "../paramValueCodec";

// Independently generated via Python's struct module (the same byte-wise reinterpretation
// pymavlink itself does), not derived from this file's own logic:
//   struct.unpack('<I', struct.pack('<i', 1000))[0]  etc. - the raw 32-bit pattern as it
// would appear on the wire, before any float interpretation.
describe("paramWireBitsToValue", () => {
  it("interprets REAL32 bits as a float", () => {
    const bits = paramValueToWireBits(3.5, MavParamType.REAL32);
    expect(paramWireBitsToValue(bits, MavParamType.REAL32)).toBe(3.5);
  });

  it("reinterprets INT32-encoded bits back to the real integer value", () => {
    expect(paramWireBitsToValue(1000, MavParamType.INT32)).toBe(1000);
  });

  it("reinterprets a negative INT32's bit pattern without collapsing through a lossy float NaN", () => {
    // -5 as int32 two's complement is 0xFFFFFFFB - if this were ever routed through a JS
    // float32 read/write, it would land in the NaN range and get canonicalized away.
    expect(paramWireBitsToValue(4294967291, MavParamType.INT32)).toBe(-5);
  });

  it("reinterprets a UINT8-encoded bit pattern", () => {
    expect(paramWireBitsToValue(200, MavParamType.UINT8)).toBe(200);
  });

  it("reinterprets an INT16-encoded bit pattern", () => {
    expect(paramWireBitsToValue(64302, MavParamType.INT16)).toBe(-1234);
  });

  it("reinterprets a UINT32-encoded bit pattern", () => {
    expect(paramWireBitsToValue(4000000000, MavParamType.UINT32)).toBe(4000000000);
  });
});

describe("paramValueToWireBits", () => {
  it("is the exact inverse of paramWireBitsToValue for every integer type, including NaN-shaped bit patterns", () => {
    const cases: Array<[number, MavParamType]> = [
      [1000, MavParamType.INT32],
      [-5, MavParamType.INT32],
      [200, MavParamType.UINT8],
      [-1234, MavParamType.INT16],
      [4000000000, MavParamType.UINT32],
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
    // Manually overwrite the first 4 bytes with a NaN-shaped bit pattern (-5 as int32) -
    // simulating what a real vehicle would send, since encodePayload's own generic float
    // writer can't produce this bit pattern itself (same hazard this module exists to avoid).
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    view.setUint32(0, 4294967291, true);
    expect(readParamValueBits(payload)).toBe(4294967291);
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
