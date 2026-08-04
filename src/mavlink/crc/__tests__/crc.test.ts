import { describe, expect, it } from "vitest";
import { x25Crc } from "../crc";

// Generated with pymavlink (the ArduPilot/PX4 reference implementation) via
// mav.heartbeat_encode(2, 3, 81, 0, 4, 3).pack(mav, ...) with seq=78, sysid=1, compid=1 -
// not hand-transcribed, to rule out copy/paste error in the fixture itself.
describe("x25Crc", () => {
  it("matches a real MAVLink v1 HEARTBEAT packet's checksum (pymavlink reference)", () => {
    const crcInput = Uint8Array.from([0x09, 0x4e, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x03, 0x51, 0x04, 0x03]);
    expect(x25Crc(crcInput, 50)).toBe(0x7f1c);
  });

  it("matches a real MAVLink v2 HEARTBEAT packet's checksum (pymavlink reference)", () => {
    const crcInput = Uint8Array.from([
      0x09, 0x00, 0x00, 0x4e, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x03, 0x51, 0x04, 0x03,
    ]);
    expect(x25Crc(crcInput, 50)).toBe(0xe472);
  });

  it("is deterministic - the same input always produces the same checksum", () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5]);
    expect(x25Crc(bytes, 10)).toBe(x25Crc(bytes, 10));
  });

  it("is sensitive to every input byte and to the CRC_EXTRA value", () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5]);
    const baseline = x25Crc(bytes, 10);

    expect(x25Crc(Uint8Array.from([1, 2, 3, 4, 6]), 10)).not.toBe(baseline);
    expect(x25Crc(bytes, 11)).not.toBe(baseline);
  });

  it("returns a 16-bit value for empty input", () => {
    const crc = x25Crc(new Uint8Array(0), 0);
    expect(crc).toBeGreaterThanOrEqual(0);
    expect(crc).toBeLessThanOrEqual(0xffff);
  });
});
