import { describe, expect, it } from "vitest";
import {
  AccelcalVehiclePos,
  AccelcalVehiclePosCommand,
  DoMotorTestCommand,
  DoSetServoCommand,
  DoStartMagCalCommand,
  GlobalPositionInt,
  Heartbeat,
  MagCalProgress,
  MagCalReport,
  MavCmd,
  MAVLINK_REGISTRY,
  MotorTestThrottleType,
  ParamValue,
  PreflightCalibrationCommand,
  PreflightRebootShutdownCommand,
  RcChannels,
  RebootShutdownAction,
  ServoOutputRaw,
} from "../registry";

describe("MAVLINK_REGISTRY", () => {
  it("maps message id 0 to the Heartbeat class", () => {
    expect(MAVLINK_REGISTRY[0]).toBe(Heartbeat);
  });

  it("combines minimal, common, standard, and ardupilotmega dialects into one registry", () => {
    // A sampling of message ids from each of the four merged dialects.
    expect(MAVLINK_REGISTRY[0]).toBeDefined(); // HEARTBEAT (minimal)
    expect(MAVLINK_REGISTRY[1]).toBeDefined(); // SYS_STATUS (common)
    expect(MAVLINK_REGISTRY[33]).toBe(GlobalPositionInt); // GLOBAL_POSITION_INT (standard)
    expect(MAVLINK_REGISTRY[150]).toBeDefined(); // SENSOR_OFFSETS (ardupilotmega)
    expect(MAVLINK_REGISTRY[22]).toBe(ParamValue); // PARAM_VALUE (common)
  });

  it("maps mag-cal message ids (MAG_CAL_PROGRESS from ardupilotmega, MAG_CAL_REPORT from common)", () => {
    expect(MAVLINK_REGISTRY[191]).toBe(MagCalProgress);
    expect(MAVLINK_REGISTRY[192]).toBe(MagCalReport);
  });

  it("DO_START_MAG_CAL is a COMMAND_LONG (msg 76) wrapper with its command field pre-set", () => {
    expect(DoStartMagCalCommand.MSG_ID).toBe(76);
    expect(new DoStartMagCalCommand().command).toBe(42424); // MAV_CMD_DO_START_MAG_CAL
  });

  it("DO_SET_SERVO is a COMMAND_LONG wrapper exposing instance/pwm; SERVO_OUTPUT_RAW is msg 36", () => {
    expect(DoSetServoCommand.MSG_ID).toBe(76);
    const cmd = new DoSetServoCommand();
    cmd.instance = 5;
    cmd.pwm = 1600;
    expect(cmd.instance).toBe(5);
    expect(cmd.pwm).toBe(1600);
    expect(MAVLINK_REGISTRY[36]).toBe(ServoOutputRaw);
  });

  it("RC_CHANNELS is msg 65, exposing chan1Raw..chan18Raw/chancount for the RC calibration screen", () => {
    expect(MAVLINK_REGISTRY[65]).toBe(RcChannels);
    expect(RcChannels.MSG_ID).toBe(65);
    const msg = new RcChannels();
    msg.chan1Raw = 1500;
    msg.chancount = 8;
    expect(msg.chan1Raw).toBe(1500);
    expect(msg.chancount).toBe(8);
  });

  it("DO_MOTOR_TEST is a COMMAND_LONG wrapper exposing instance/throttleType/throttle/timeout", () => {
    expect(DoMotorTestCommand.MSG_ID).toBe(76);
    const cmd = new DoMotorTestCommand();
    cmd.instance = 3;
    cmd.throttleType = MotorTestThrottleType.THROTTLE_PERCENT;
    cmd.throttle = 10;
    cmd.timeout = 3;
    cmd.motorCount = 1;
    expect(cmd.instance).toBe(3);
    expect(cmd.throttleType).toBe(0);
    expect(cmd.throttle).toBe(10);
    expect(cmd.timeout).toBe(3);
  });

  it("PREFLIGHT_CALIBRATION is a COMMAND_LONG wrapper exposing accelerometer (param5) - real codes: FULL=1, TRIM=2, SIMPLE=4", () => {
    expect(PreflightCalibrationCommand.MSG_ID).toBe(76);
    const cmd = new PreflightCalibrationCommand();
    expect(cmd.command).toBe(241); // MAV_CMD_PREFLIGHT_CALIBRATION
    cmd.accelerometer = 1;
    expect(cmd.accelerometer).toBe(1);
  });

  it("ACCELCAL_VEHICLE_POS is a COMMAND_LONG wrapper (MAV_CMD 42429) exposing position, with real enum codes", () => {
    expect(AccelcalVehiclePosCommand.MSG_ID).toBe(76);
    const cmd = new AccelcalVehiclePosCommand();
    expect(cmd.command).toBe(42429);
    cmd.position = AccelcalVehiclePos.LEVEL;
    expect(cmd.position).toBe(1);
    expect(AccelcalVehiclePos.NOSEUP).toBe(5);
    expect(AccelcalVehiclePos.SUCCESS).toBe(16777215);
    expect(AccelcalVehiclePos.FAILED).toBe(16777216);
  });

  it("PREFLIGHT_REBOOT_SHUTDOWN is a COMMAND_LONG wrapper (MAV_CMD 246) exposing autopilot (param1) - real code REBOOT=1", () => {
    expect(PreflightRebootShutdownCommand.MSG_ID).toBe(76);
    const cmd = new PreflightRebootShutdownCommand();
    expect(cmd.command).toBe(246);
    cmd.autopilot = RebootShutdownAction.REBOOT;
    expect(cmd.autopilot).toBe(1);
  });

  it("MavCmd merges both standard commands and ArduPilot-specific ones", () => {
    // Regression test: ardupilotmega's own MavCmd export contains ONLY its ~32 ArduPilot-
    // specific additions, not any of common's ~166 standard commands - confirmed by dumping
    // both objects directly, not assumed. DO_SET_SERVO (183, standard) is missing from
    // ardupilotmega's MavCmd on its own; DO_START_MAG_CAL (42424, ArduPilot-specific) is
    // missing from common's on its own. Both must resolve correctly from this merged export.
    expect(MavCmd.DO_SET_SERVO).toBe(183);
    expect(MavCmd.DO_START_MAG_CAL).toBe(42424);
  });

  it("Heartbeat carries the field metadata needed to decode/encode it", () => {
    expect(Heartbeat.MSG_ID).toBe(0);
    expect(Heartbeat.MAGIC_NUMBER).toBe(50);
    expect(Heartbeat.FIELDS.map((f) => f.name)).toEqual([
      "customMode",
      "type",
      "autopilot",
      "baseMode",
      "systemStatus",
      "mavlinkVersion",
    ]);
  });
});
