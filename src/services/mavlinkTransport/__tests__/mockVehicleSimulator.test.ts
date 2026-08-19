import type { MavLinkData } from "mavlink-mappings/dist/lib/mavlink";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeMessage, encodePacket } from "../../../mavlink/codec/codec";
import { MavlinkFramer, type DecodedMavlinkPacket } from "../../../mavlink/framer/framer";
import { buildParamSetPacket, paramValueToWireBits, paramWireBitsToValue, readParamValueBits } from "../../../mavlink/paramValueCodec/paramValueCodec";
import {
  AccelcalVehiclePos,
  AccelcalVehiclePosCommand,
  Attitude,
  CommandAck,
  ComponentArmDisarmCommand,
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
  MavModeFlag,
  MavResult,
  MavType,
  MotorTestThrottleType,
  ParamRequestList,
  ParamRequestRead,
  ParamSet,
  ParamValue,
  PreflightCalibrationCommand,
  PreflightRebootShutdownCommand,
  RcChannels,
  RebootShutdownAction,
  RequestDataStream,
  ServoOutputRaw,
  SetMode,
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

  it("streams RC_CHANNELS with a simulated sweep once telemetry starts, moving over time", () => {
    handle.handleAppBytes(encodeFromApp(new RequestDataStream()));

    emitted = [];
    vi.advanceTimersByTime(250);
    const first = decodeAll(emitted).find((p) => p.msgId === RcChannels.MSG_ID);
    expect(first).toBeDefined();
    const firstMsg = first!.message as RcChannels;
    expect(firstMsg.chancount).toBe(8);
    expect(firstMsg.chan1Raw).toBeGreaterThanOrEqual(1000);
    expect(firstMsg.chan1Raw).toBeLessThanOrEqual(2000);
    // Unused channels (9-18, beyond the simulated 8) report UINT16_MAX, not 0 - the real
    // MAVLink convention for "unused" (confirmed against common.xml).
    expect(firstMsg.chan9Raw).toBe(0xffff);

    emitted = [];
    vi.advanceTimersByTime(5000); // far enough along the sine sweep to have moved
    const later = decodeAll(emitted).find((p) => p.msgId === RcChannels.MSG_ID)!.message as RcChannels;
    expect(later.chan1Raw).not.toBe(firstMsg.chan1Raw);
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

  it("acks a level (TRIM) cal immediately with no ACCELCAL_VEHICLE_POS follow-up", () => {
    const cmd = new PreflightCalibrationCommand();
    cmd.accelerometer = 2; // TRIM

    emitted = [];
    handle.handleAppBytes(encodeFromApp(cmd));

    const packets = decodeAll(emitted);
    const ack = packets.find((p) => p.msgId === CommandAck.MSG_ID);
    expect(ack).toBeDefined();
    expect((ack!.message as CommandAck).result).toBe(MavResult.ACCEPTED);
    expect(packets.some((p) => p.msgId === AccelcalVehiclePosCommand.MSG_ID)).toBe(false);

    emitted = [];
    vi.advanceTimersByTime(2000);
    // Heartbeats keep flowing regardless (1Hz, unrelated to cal) - only the cal-specific
    // messages matter here.
    const followUp = decodeAll(emitted).filter((p) => p.msgId !== Heartbeat.MSG_ID);
    expect(followUp).toHaveLength(0);
  });

  it("acks a pure RC-only PREFLIGHT_CALIBRATION call (remoteControl set, nothing else) with UNSUPPORTED, matching real ArduPilot", () => {
    const cmd = new PreflightCalibrationCommand();
    cmd.remoteControl = 1;

    emitted = [];
    handle.handleAppBytes(encodeFromApp(cmd));

    const ack = decodeAll(emitted).find((p) => p.msgId === CommandAck.MSG_ID);
    expect(ack).toBeDefined();
    expect((ack!.message as CommandAck).result).toBe(MavResult.UNSUPPORTED);
  });

  it("steps a full (6-position) accel cal through LEVEL->LEFT->RIGHT->NOSEDOWN->NOSEUP->BACK->SUCCESS, one position at a time, only after each is echoed back", () => {
    const cmd = new PreflightCalibrationCommand();
    cmd.accelerometer = 1; // FULL

    emitted = [];
    handle.handleAppBytes(encodeFromApp(cmd));
    const ack = decodeAll(emitted).find((p) => p.msgId === CommandAck.MSG_ID);
    expect((ack!.message as CommandAck).result).toBe(MavResult.ACCEPTED);

    const sequence = [
      AccelcalVehiclePos.LEVEL,
      AccelcalVehiclePos.LEFT,
      AccelcalVehiclePos.RIGHT,
      AccelcalVehiclePos.NOSEDOWN,
      AccelcalVehiclePos.NOSEUP,
      AccelcalVehiclePos.BACK,
    ];

    for (const expectedPosition of sequence) {
      emitted = [];
      vi.advanceTimersByTime(1000); // >= ACCEL_CAL_STEP_DELAY_MS
      const posCmd = decodeAll(emitted).find((p) => p.msgId === AccelcalVehiclePosCommand.MSG_ID);
      expect(posCmd).toBeDefined();
      // The framer decodes every msg-76 packet generically as the base CommandLong class (one
      // registry entry per message id) - re-decoding the raw payload against the specific
      // AccelcalVehiclePosCommand subclass is what actually exposes `.position`.
      expect(decodeMessage(AccelcalVehiclePosCommand, posCmd!.payload).position).toBe(expectedPosition);

      // Echo it back, exactly like the app does once the user confirms placement.
      const echo = new AccelcalVehiclePosCommand();
      echo.position = expectedPosition;
      handle.handleAppBytes(encodeFromApp(echo));
    }

    emitted = [];
    vi.advanceTimersByTime(1000);
    const final = decodeAll(emitted).find((p) => p.msgId === AccelcalVehiclePosCommand.MSG_ID);
    expect(decodeMessage(AccelcalVehiclePosCommand, final!.payload).position).toBe(AccelcalVehiclePos.SUCCESS);
  });

  it("ignores an out-of-order/stale position echo (doesn't match the position currently being waited on)", () => {
    const cmd = new PreflightCalibrationCommand();
    cmd.accelerometer = 1;
    handle.handleAppBytes(encodeFromApp(cmd));
    vi.advanceTimersByTime(1000); // vehicle now requests LEVEL

    emitted = [];
    const staleEcho = new AccelcalVehiclePosCommand();
    staleEcho.position = AccelcalVehiclePos.BACK; // wrong - vehicle is waiting on LEVEL, not BACK
    handle.handleAppBytes(encodeFromApp(staleEcho));
    vi.advanceTimersByTime(2000);

    // No advance happened - nothing new (besides unrelated heartbeats) was emitted for the stale echo.
    const followUp = decodeAll(emitted).filter((p) => p.msgId !== Heartbeat.MSG_ID);
    expect(followUp).toHaveLength(0);
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

  it("seeds SERVO1-8_REVERSED=0 (Normal) so Dev Mode's reverse checkboxes have something real to toggle", () => {
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
    expect(values.get("SERVO1_REVERSED")).toBe(0);
    expect(values.get("SERVO8_REVERSED")).toBe(0);
  });

  it("acks PREFLIGHT_REBOOT_SHUTDOWN(autopilot=REBOOT) with ACCEPTED", () => {
    const cmd = new PreflightRebootShutdownCommand();
    cmd.autopilot = RebootShutdownAction.REBOOT;

    emitted = [];
    handle.handleAppBytes(encodeFromApp(cmd));

    const ack = decodeAll(emitted).find((p) => p.msgId === CommandAck.MSG_ID);
    expect(ack).toBeDefined();
    expect((ack!.message as CommandAck).result).toBe(MavResult.ACCEPTED);
  });

  it("acks COMPONENT_ARM_DISARM(arm=1) and reports armed on an immediate extra heartbeat", () => {
    const cmd = new ComponentArmDisarmCommand();
    cmd.arm = 1;
    cmd.force = 0;

    emitted = [];
    handle.handleAppBytes(encodeFromApp(cmd));

    const packets = decodeAll(emitted);
    const ack = packets.find((p) => p.msgId === CommandAck.MSG_ID);
    expect(ack).toBeDefined();
    expect((ack!.message as CommandAck).result).toBe(MavResult.ACCEPTED);
    const hb = packets.find((p) => p.msgId === Heartbeat.MSG_ID);
    expect(hb).toBeDefined();
    expect((hb!.message as Heartbeat).baseMode & MavModeFlag.SAFETY_ARMED).not.toBe(0);
  });

  it("disarms again and reports disarmed on the next heartbeat", () => {
    const arm = new ComponentArmDisarmCommand();
    arm.arm = 1;
    arm.force = 0;
    handle.handleAppBytes(encodeFromApp(arm));

    const disarm = new ComponentArmDisarmCommand();
    disarm.arm = 0;
    disarm.force = 0;
    emitted = [];
    handle.handleAppBytes(encodeFromApp(disarm));

    const hb = decodeAll(emitted).find((p) => p.msgId === Heartbeat.MSG_ID);
    expect(hb).toBeDefined();
    expect((hb!.message as Heartbeat).baseMode & MavModeFlag.SAFETY_ARMED).toBe(0);
  });

  it("applies SET_MODE's custom_mode and reports it on an immediate extra heartbeat, with no COMMAND_ACK (unlike every command above)", () => {
    const msg = new SetMode();
    msg.baseMode = MavModeFlag.CUSTOM_MODE_ENABLED as unknown as SetMode["baseMode"];
    msg.customMode = 11; // Plane's RTL

    emitted = [];
    handle.handleAppBytes(encodeFromApp(msg));

    const packets = decodeAll(emitted);
    expect(packets.some((p) => p.msgId === CommandAck.MSG_ID)).toBe(false);
    const hb = packets.find((p) => p.msgId === Heartbeat.MSG_ID);
    expect(hb).toBeDefined();
    expect((hb!.message as Heartbeat).customMode).toBe(11);
  });
});
