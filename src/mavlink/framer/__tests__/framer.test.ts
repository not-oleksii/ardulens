import { describe, expect, it } from "vitest";
import { Heartbeat, type MavModeFlag } from "mavlink-mappings/dist/lib/minimal";
import { encodePacket } from "../../codec/codec";
import { MavlinkFramer } from "../framer";

const NO_MODE_FLAGS = 0 as MavModeFlag;

// Real pymavlink-generated packets (mav.heartbeat_encode(2, 3, 81, 0, 4, 3).pack(mav, ...),
// seq=78, sysid=1, compid=1) - see codec.test.ts for how these were produced.
const REAL_V1_HEARTBEAT = Uint8Array.from([
  0xfe, 0x09, 0x4e, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x03, 0x51, 0x04, 0x03, 0x1c, 0x7f,
]);
const REAL_V2_HEARTBEAT = Uint8Array.from([
  0xfd, 0x09, 0x00, 0x00, 0x4e, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x03, 0x51, 0x04, 0x03,
  0x72, 0xe4,
]);

function sampleHeartbeatPacket(seq: number, sysid: number): Uint8Array {
  const hb = new Heartbeat();
  hb.type = 1;
  hb.autopilot = 3;
  hb.baseMode = NO_MODE_FLAGS;
  hb.customMode = 0;
  hb.systemStatus = 3;
  hb.mavlinkVersion = 3;
  return encodePacket(hb, { seq, sysid, compid: 1 });
}

describe("MavlinkFramer", () => {
  it("decodes a real v1 HEARTBEAT packet fed in one push", () => {
    const framer = new MavlinkFramer();

    const packets = framer.push(REAL_V1_HEARTBEAT);

    expect(packets).toHaveLength(1);
    expect(packets[0]!.msgId).toBe(0);
    expect(packets[0]!.sysid).toBe(1);
    expect(packets[0]!.compid).toBe(1);
    expect(packets[0]!.seq).toBe(0x4e);
    const hb = packets[0]!.message as Heartbeat;
    expect(hb.type).toBe(2);
    expect(hb.autopilot).toBe(3);
    expect(hb.baseMode).toBe(81);
    expect(hb.systemStatus).toBe(4);
  });

  it("decodes a real v2 HEARTBEAT packet fed in one push", () => {
    const framer = new MavlinkFramer();

    const packets = framer.push(REAL_V2_HEARTBEAT);

    expect(packets).toHaveLength(1);
    const hb = packets[0]!.message as Heartbeat;
    expect(hb.type).toBe(2);
    expect(hb.baseMode).toBe(81);
  });

  it("reassembles a packet split across multiple pushes", () => {
    const framer = new MavlinkFramer();

    const first = framer.push(REAL_V2_HEARTBEAT.subarray(0, 8));
    expect(first).toHaveLength(0);

    const second = framer.push(REAL_V2_HEARTBEAT.subarray(8, 15));
    expect(second).toHaveLength(0);

    const third = framer.push(REAL_V2_HEARTBEAT.subarray(15));
    expect(third).toHaveLength(1);
    expect((third[0]!.message as Heartbeat).baseMode).toBe(81);
  });

  it("decodes two packets arriving back-to-back in a single push", () => {
    const framer = new MavlinkFramer();
    const first = sampleHeartbeatPacket(1, 1);
    const second = sampleHeartbeatPacket(2, 1);
    const combined = new Uint8Array(first.length + second.length);
    combined.set(first, 0);
    combined.set(second, first.length);

    const packets = framer.push(combined);

    expect(packets).toHaveLength(2);
    expect(packets[0]!.seq).toBe(1);
    expect(packets[1]!.seq).toBe(2);
  });

  it("resyncs past leading garbage bytes before a valid packet", () => {
    const framer = new MavlinkFramer();
    const garbage = Uint8Array.from([0x00, 0x11, 0x22, 0xfd, 0x99]); // includes a false-positive STX (0xFD)
    const combined = new Uint8Array(garbage.length + REAL_V2_HEARTBEAT.length);
    combined.set(garbage, 0);
    combined.set(REAL_V2_HEARTBEAT, garbage.length);

    const packets = framer.push(combined);

    expect(packets).toHaveLength(1);
    expect((packets[0]!.message as Heartbeat).baseMode).toBe(81);
  });

  it("rejects a packet with a corrupted CRC and still recovers the next valid one", () => {
    const framer = new MavlinkFramer();
    const corrupted = Uint8Array.from(REAL_V2_HEARTBEAT);
    corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 0xff; // flip the last CRC byte
    const combined = new Uint8Array(corrupted.length + REAL_V2_HEARTBEAT.length);
    combined.set(corrupted, 0);
    combined.set(REAL_V2_HEARTBEAT, corrupted.length);

    const packets = framer.push(combined);

    expect(packets).toHaveLength(1);
    expect(packets[0]!.seq).toBe(0x4e);
  });

  it("returns an empty array when fed only partial header bytes", () => {
    const framer = new MavlinkFramer();
    expect(framer.push(REAL_V2_HEARTBEAT.subarray(0, 3))).toHaveLength(0);
  });
});
