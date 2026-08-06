import type { MavLinkData } from "mavlink-mappings/dist/lib/mavlink";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodePacket } from "../../../mavlink/codec/codec";
import { MavlinkFramer, type DecodedMavlinkPacket } from "../../../mavlink/framer/framer";
import { buildParamSetPacket, paramValueToWireBits, paramWireBitsToValue, readParamValueBits } from "../../../mavlink/paramValueCodec/paramValueCodec";
import {
  Attitude,
  CommandAck,
  DoAcceptMagCalCommand,
  DoCancelMagCalCommand,
  DoMotorTestCommand,
  DoSetServoCommand,
  DoStartMagCalCommand,
  GlobalPositionInt,
  GpsRawInt,
  Heartbeat,
  MagCalProgress,
  MagCalReport,
  MagCalStatus,
  MavResult,
  MavType,
  MotorTestThrottleType,
  ParamRequestList,
  ParamRequestRead,
  ParamSet,
  ParamValue,
  RequestDataStream,
  ServoOutputRaw,
  SysStatus,
  VfrHud,
} from "../../../mavlink/registry/registry";
import { startMockVehicle, type MockVehicleHandle } from "../mockVehicleSimulator";

const GCS_SYSID = 255;
const GCS_COMPID = 190;

function decodeAll(chunks: Uint8Array[]): DecodedMavlinkPacket[] {
  const framer = new MavlinkFramer();
  const packets: DecodedMavlinkPacket[] = [];
  for (const chunk of chunks) packets.push(...framer.push(chunk));
  return packets;
}

function encodeFromApp(msg: MavLinkData, seq = 1): Uint8Array {
  return encodePacket(msg, { seq, sysid: GCS_SYSID, compid: GCS_COMPID });
}

describe("startMockVehicle", () => {
  let emitted: Uint8Array[];
  let handle: MockVehicleHandle;

  beforeEach(() => {
    vi.useFakeTimers();
    emitted = [];
    handle = startMockVehicle(MavType.FIXED_WING, (bytes) => emitted.push(bytes));
  });

  afterEach(() => {
    handle.stop();
    vi.useRealTimers();
  });

  it("sends an immediate heartbeat with the given vehicle type", () => {
    const packets = decodeAll(emitted);
    const hb = packets.find((p) => p.msgId === Heartbeat.MSG_ID);
    expect(hb).toBeDefined();
    expect((hb!.message as Heartbeat).type).toBe(MavType.FIXED_WING);
  });

  it("keeps sending heartbeats every second", () => {
    emitted = [];
    vi.advanceTimersByTime(3000);
    const heartbeats = decodeAll(emitted).filter((p) => p.msgId === Heartbeat.MSG_ID);
    expect(heartbeats.length).toBe(3);
  });

  it("starts streaming telemetry only after REQUEST_DATA_STREAM arrives", () => {
    emitted = [];
    vi.advanceTimersByTime(2000);
    expect(decodeAll(emitted).some((p) => p.msgId === Attitude.MSG_ID)).toBe(false);

    const req = new RequestDataStream();
    req.reqStreamId = 0;
    req.reqMessageRate = 4;
    req.startStop = 1;
    handle.handleAppBytes(encodeFromApp(req));

    emitted = [];
    vi.advanceTimersByTime(1000);
    const packets = decodeAll(emitted);
    expect(packets.some((p) => p.msgId === Attitude.MSG_ID)).toBe(true);
    expect(packets.some((p) => p.msgId === VfrHud.MSG_ID)).toBe(true);
    expect(packets.some((p) => p.msgId === SysStatus.MSG_ID)).toBe(true);
    expect(packets.some((p) => p.msgId === GpsRawInt.MSG_ID)).toBe(true);
    expect(packets.some((p) => p.msgId === GlobalPositionInt.MSG_ID)).toBe(true);
  });

  it("dumps every param except the one deliberately-dropped param on PARAM_REQUEST_LIST", () => {
    emitted = [];
    handle.handleAppBytes(encodeFromApp(new ParamRequestList()));

    const names = decodeAll(emitted)
      .filter((p) => p.msgId === ParamValue.MSG_ID)
      .map((p) => (p.message as ParamValue).paramId);

    expect(names).toContain("SERVO1_FUNCTION");
    expect(names).not.toContain("SERVO3_TRIM");
  });

  it("answers a PARAM_REQUEST_READ by name for the param dropped from the list dump", () => {
    emitted = [];
    const req = new ParamRequestRead();
    req.paramId = "SERVO3_TRIM";
    req.paramIndex = -1;
    handle.handleAppBytes(encodeFromApp(req));

    const paramValues = decodeAll(emitted).filter((p) => p.msgId === ParamValue.MSG_ID);
    expect(paramValues).toHaveLength(1);
    expect((paramValues[0]!.message as ParamValue).paramId).toBe("SERVO3_TRIM");
  });

  it("answers a PARAM_REQUEST_READ by index", () => {
    emitted = [];
    const req = new ParamRequestRead();
    req.paramId = "";
    req.paramIndex = 0; // ARSPD_USE is seeded first
    handle.handleAppBytes(encodeFromApp(req));

    const paramValues = decodeAll(emitted).filter((p) => p.msgId === ParamValue.MSG_ID);
    expect(paramValues).toHaveLength(1);
    expect((paramValues[0]!.message as ParamValue).paramId).toBe("ARSPD_USE");
  });

  it("applies a PARAM_SET and echoes the new value back", () => {
    const msg = new ParamSet();
    msg.paramId = "SERVO1_TRIM";
    msg.paramType = 4; // INT16 - matches the seeded type
    msg.paramValue = 0;
    const wireBits = paramValueToWireBits(1600, msg.paramType);
    const packet = buildParamSetPacket(msg, wireBits, { seq: 1, sysid: GCS_SYSID, compid: GCS_COMPID });

    emitted = [];
    handle.handleAppBytes(packet);

    const echoed = decodeAll(emitted).find((p) => p.msgId === ParamValue.MSG_ID);
    expect(echoed).toBeDefined();
    const echoedMsg = echoed!.message as ParamValue;
    expect(echoedMsg.paramId).toBe("SERVO1_TRIM");
    expect(paramWireBitsToValue(readParamValueBits(echoed!.payload), echoedMsg.paramType)).toBe(1600);

    // A subsequent read confirms the internal value really changed, not just the one echo.
    emitted = [];
    const req = new ParamRequestRead();
    req.paramId = "SERVO1_TRIM";
    req.paramIndex = -1;
    handle.handleAppBytes(encodeFromApp(req));
    const reread = decodeAll(emitted).find((p) => p.msgId === ParamValue.MSG_ID)!;
    expect(paramWireBitsToValue(readParamValueBits(reread.payload), (reread.message as ParamValue).paramType)).toBe(1600);
  });

  it("acks DO_START_MAG_CAL and progresses to a SUCCESS MAG_CAL_REPORT", () => {
    emitted = [];
    handle.handleAppBytes(encodeFromApp(new DoStartMagCalCommand()));

    const ack = decodeAll(emitted).find((p) => p.msgId === CommandAck.MSG_ID);
    expect(ack).toBeDefined();
    expect((ack!.message as CommandAck).result).toBe(MavResult.ACCEPTED);

    emitted = [];
    vi.advanceTimersByTime(300 * 14); // just under 100%
    const midProgress = decodeAll(emitted)
      .filter((p) => p.msgId === MagCalProgress.MSG_ID)
      .map((p) => p.message as MagCalProgress);
    expect(midProgress.length).toBeGreaterThan(0);
    expect(midProgress.at(-1)!.completionPct).toBeLessThan(100);
    expect(decodeAll(emitted).some((p) => p.msgId === MagCalReport.MSG_ID)).toBe(false);

    emitted = [];
    vi.advanceTimersByTime(300 * 2); // now past 100%
    const reports = decodeAll(emitted)
      .filter((p) => p.msgId === MagCalReport.MSG_ID)
      .map((p) => p.message as MagCalReport);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports[0]!.calStatus).toBe(MagCalStatus.SUCCESS);
  });

  it("acks DO_ACCEPT_MAG_CAL without side effects", () => {
    emitted = [];
    handle.handleAppBytes(encodeFromApp(new DoAcceptMagCalCommand()));
    const ack = decodeAll(emitted).find((p) => p.msgId === CommandAck.MSG_ID);
    expect((ack!.message as CommandAck).result).toBe(MavResult.ACCEPTED);
  });

  it("acks DO_CANCEL_MAG_CAL and stops further progress", () => {
    handle.handleAppBytes(encodeFromApp(new DoStartMagCalCommand()));
    vi.advanceTimersByTime(300 * 3);

    emitted = [];
    handle.handleAppBytes(encodeFromApp(new DoCancelMagCalCommand()));
    expect(decodeAll(emitted).some((p) => p.msgId === CommandAck.MSG_ID)).toBe(true);

    emitted = [];
    vi.advanceTimersByTime(300 * 20);
    expect(decodeAll(emitted).some((p) => p.msgId === MagCalProgress.MSG_ID)).toBe(false);
    expect(decodeAll(emitted).some((p) => p.msgId === MagCalReport.MSG_ID)).toBe(false);
  });

  it("echoes DO_SET_SERVO back via SERVO_OUTPUT_RAW", () => {
    const cmd = new DoSetServoCommand();
    cmd.instance = 3;
    cmd.pwm = 1750;

    emitted = [];
    handle.handleAppBytes(encodeFromApp(cmd));

    const raw = decodeAll(emitted).find((p) => p.msgId === ServoOutputRaw.MSG_ID);
    expect(raw).toBeDefined();
    expect((raw!.message as ServoOutputRaw).servo3Raw).toBe(1750);
  });

  it("stop() clears all timers so nothing more is emitted", () => {
    handle.handleAppBytes(encodeFromApp(new RequestDataStream()));
    handle.handleAppBytes(encodeFromApp(new DoStartMagCalCommand()));
    handle.stop();

    emitted = [];
    vi.advanceTimersByTime(10000);
    expect(emitted).toHaveLength(0);
  });

  it("does not seed FRAME_CLASS/FRAME_TYPE for a non-Copter vehicle (this handle is FIXED_WING)", () => {
    emitted = [];
    handle.handleAppBytes(encodeFromApp(new ParamRequestList()));
    const names = decodeAll(emitted)
      .filter((p) => p.msgId === ParamValue.MSG_ID)
      .map((p) => (p.message as ParamValue).paramId);
    expect(names).not.toContain("FRAME_CLASS");
    expect(names).not.toContain("FRAME_TYPE");
  });
});

describe("startMockVehicle (Copter)", () => {
  let emitted: Uint8Array[];
  let handle: MockVehicleHandle;

  beforeEach(() => {
    vi.useFakeTimers();
    emitted = [];
    handle = startMockVehicle(MavType.QUADROTOR, (bytes) => emitted.push(bytes));
  });

  afterEach(() => {
    handle.stop();
    vi.useRealTimers();
  });

  it("seeds FRAME_CLASS=1 (Quad) and FRAME_TYPE=1 (X) - one of frameDiagrams.ts's verified layouts", () => {
    emitted = [];
    handle.handleAppBytes(encodeFromApp(new ParamRequestList()));
    const values = new Map(
      decodeAll(emitted)
        .filter((p) => p.msgId === ParamValue.MSG_ID)
        .map((p) => {
          const msg = p.message as ParamValue;
          return [msg.paramId, paramWireBitsToValue(readParamValueBits(p.payload), msg.paramType)] as const;
        }),
    );
    expect(values.get("FRAME_CLASS")).toBe(1);
    expect(values.get("FRAME_TYPE")).toBe(1);
  });

  it("echoes DO_MOTOR_TEST back via SERVO_OUTPUT_RAW, converting throttle percent to PWM", () => {
    const cmd = new DoMotorTestCommand();
    cmd.instance = 2;
    cmd.throttleType = MotorTestThrottleType.THROTTLE_PERCENT;
    cmd.throttle = 10;
    cmd.timeout = 3;
    cmd.motorCount = 1;

    emitted = [];
    handle.handleAppBytes(encodeFromApp(cmd));

    const raw = decodeAll(emitted).find((p) => p.msgId === ServoOutputRaw.MSG_ID);
    expect(raw).toBeDefined();
    expect((raw!.message as ServoOutputRaw).servo2Raw).toBe(1100); // 10% -> 1000 + 0.10*1000

    // Release sends throttle=0, which should return that channel to 1000us (motor off).
    const stopCmd = new DoMotorTestCommand();
    stopCmd.instance = 2;
    stopCmd.throttleType = MotorTestThrottleType.THROTTLE_PERCENT;
    stopCmd.throttle = 0;
    emitted = [];
    handle.handleAppBytes(encodeFromApp(stopCmd));
    const stopRaw = decodeAll(emitted).find((p) => p.msgId === ServoOutputRaw.MSG_ID);
    expect((stopRaw!.message as ServoOutputRaw).servo2Raw).toBe(1000);
  });
});
