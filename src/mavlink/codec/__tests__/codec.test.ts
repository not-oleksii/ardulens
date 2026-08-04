import { describe, expect, it } from "vitest";
import { Heartbeat, MavModeFlag } from "mavlink-mappings/dist/lib/minimal";
import { decodeMessage, encodePacket, encodePayload } from "../codec";

function sampleHeartbeat(): Heartbeat {
  const hb = new Heartbeat();
  hb.type = 2;
  hb.autopilot = 3;
  // 81 = MANUAL_INPUT_ENABLED(64) | STABILIZE_ENABLED(16) | CUSTOM_MODE_ENABLED(1) - matches
  // the real pymavlink-generated fixture below byte-for-byte.
  hb.baseMode = MavModeFlag.MANUAL_INPUT_ENABLED | MavModeFlag.STABILIZE_ENABLED | MavModeFlag.CUSTOM_MODE_ENABLED;
  hb.customMode = 0;
  hb.systemStatus = 4;
  hb.mavlinkVersion = 3;
  return hb;
}

describe("encodePacket", () => {
  it("matches a real MAVLink v2 HEARTBEAT packet byte-for-byte (pymavlink reference)", () => {
    // Generated via pymavlink: mav.heartbeat_encode(2, 3, 81, 0, 4, 3).pack(mav) with
    // seq=78, sysid=1, compid=1.
    const expected = Uint8Array.from([
      0xfd, 0x09, 0x00, 0x00, 0x4e, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x03, 0x51, 0x04,
      0x03, 0x72, 0xe4,
    ]);

    const packet = encodePacket(sampleHeartbeat(), { seq: 78, sysid: 1, compid: 1 });

    expect(Array.from(packet)).toEqual(Array.from(expected));
  });

  it("wraps seq/sysid/compid to a single byte", () => {
    const packet = encodePacket(sampleHeartbeat(), { seq: 256 + 5, sysid: 256 + 9, compid: 256 + 1 });
    expect(packet[4]).toBe(5); // seq
    expect(packet[5]).toBe(9); // sysid
    expect(packet[6]).toBe(1); // compid
  });
});

describe("encodePayload / decodeMessage round-trip", () => {
  it("round-trips every Heartbeat field", () => {
    const original = sampleHeartbeat();

    const decoded = decodeMessage(Heartbeat, encodePayload(original));

    expect(decoded.type).toBe(original.type);
    expect(decoded.autopilot).toBe(original.autopilot);
    expect(decoded.baseMode).toBe(original.baseMode);
    expect(decoded.customMode).toBe(original.customMode);
    expect(decoded.systemStatus).toBe(original.systemStatus);
    expect(decoded.mavlinkVersion).toBe(original.mavlinkVersion);
  });

  it("decodes a real (pymavlink-generated) v2 HEARTBEAT payload correctly", () => {
    const payload = Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x02, 0x03, 0x51, 0x04, 0x03]);

    const decoded = decodeMessage(Heartbeat, payload);

    expect(decoded.customMode).toBe(0);
    expect(decoded.type).toBe(2);
    expect(decoded.autopilot).toBe(3);
    expect(decoded.baseMode).toBe(81);
    expect(decoded.systemStatus).toBe(4);
    expect(decoded.mavlinkVersion).toBe(3);
  });

  it("handles a v2-truncated payload (trailing zero bytes stripped) as implicit zeros", () => {
    // A real v2 sender may strip trailing zero bytes from the payload. mavlinkVersion=0 and
    // systemStatus=0 here, so a truncating sender could legally send only 6 payload bytes
    // instead of the full 9.
    const truncatedPayload = Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x02, 0x03]);

    const decoded = decodeMessage(Heartbeat, truncatedPayload);

    expect(decoded.baseMode).toBe(0);
    expect(decoded.systemStatus).toBe(0);
    expect(decoded.mavlinkVersion).toBe(0);
  });
});
