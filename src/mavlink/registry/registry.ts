// Deep-imported from the specific dialect submodules, never from the "mavlink-mappings"
// package root - the root barrel re-exports "mavlink-mappings-gen" (a Node/XML code-gen
// tool with dependencies like xml2js/ts-node that don't belong in a browser bundle). These
// submodule files are pure TS/JS with zero Node built-ins.
import { REGISTRY as MINIMAL_REGISTRY } from "mavlink-mappings/dist/lib/minimal";
import { REGISTRY as COMMON_REGISTRY, MavCmd as CommonMavCmd } from "mavlink-mappings/dist/lib/common";
import { REGISTRY as STANDARD_REGISTRY } from "mavlink-mappings/dist/lib/standard";
import { REGISTRY as ARDUPILOTMEGA_REGISTRY, MavCmd as ArduMavCmd } from "mavlink-mappings/dist/lib/ardupilotmega";
import type { MavLinkPacketRegistry } from "mavlink-mappings/dist/lib/mavlink";

export { Heartbeat } from "mavlink-mappings/dist/lib/minimal";
export { MavAutopilot, MavModeFlag, MavState, MavType } from "mavlink-mappings/dist/lib/minimal";
export { Attitude, GpsRawInt, GpsFixType, RequestDataStream, SysStatus, VfrHud } from "mavlink-mappings/dist/lib/common";
export { MavDataStream } from "mavlink-mappings/dist/lib/common";
export { MavParamType, ParamRequestList, ParamRequestRead, ParamSet, ParamValue } from "mavlink-mappings/dist/lib/common";
export { CommandAck, MavResult, MagCalReport, MagCalStatus } from "mavlink-mappings/dist/lib/common";
// DO_SET_SERVO (COMMAND_LONG wrapper, like the mag-cal commands) directly sets one output
// channel's PWM - used for the Plane control-surface test. SERVO_OUTPUT_RAW reports the
// vehicle's actual live per-channel PWM back, so the test's effect can be confirmed rather
// than just trusted.
export { DoSetServoCommand, ServoOutputRaw } from "mavlink-mappings/dist/lib/common";
// DO_MOTOR_TEST spins one Copter motor at a given throttle for a bounded duration (the
// firmware itself auto-stops after `timeout` even if a follow-up stop command is lost, on
// top of the explicit stop this app sends on release) - used for the motor-identification
// test, which is the Copter counterpart to DO_SET_SERVO's Plane surface test above.
export { DoMotorTestCommand, MotorTestThrottleType } from "mavlink-mappings/dist/lib/common";
// GLOBAL_POSITION_INT lives in the "standard" dialect file, not "common" - this package
// splits a curated subset of core messages there even though they're not ArduPilot-specific.
export { GlobalPositionInt } from "mavlink-mappings/dist/lib/standard";
// MAG_CAL_PROGRESS and the DO_START/ACCEPT/CANCEL_MAG_CAL commands are ArduPilot-specific
// (not in vanilla MAVLink common), so they live in the ardupilotmega dialect file. The three
// commands are typed COMMAND_LONG wrappers (MSG_ID 76) with their `command` field defaulted
// to the right MAV_CMD id by their constructors - not distinct message ids of their own.
export { MagCalProgress, DoStartMagCalCommand, DoAcceptMagCalCommand, DoCancelMagCalCommand } from "mavlink-mappings/dist/lib/ardupilotmega";
// NOT simply "ardupilotmega's MavCmd extends common's" - verified (while building the mock
// vehicle simulator, which needs to recognize a standard command like DO_SET_SERVO) that
// ardupilotmega's own MavCmd export contains ONLY its ~32 ArduPilot-specific additions (e.g.
// DO_START_MAG_CAL=42424), not any of common's ~166 standard commands (e.g. DO_SET_SERVO=183)
// - a real, previously-latent gap, since nothing needed a standard command id from this
// export before. Merged here instead (confirmed zero overlapping member names between the
// two) so `MavCmd.<anything>` resolves correctly regardless of which dialect defines it.
export const MavCmd = { ...CommonMavCmd, ...ArduMavCmd };
export type MavCmd = CommonMavCmd | ArduMavCmd;

/**
 * Each dialect file's own REGISTRY only lists the messages *defined* in that file, not
 * messages it inherits from dialects it extends - ArduPilot's wire traffic spans all four,
 * so the usable registry is their union (minimal: HEARTBEAT and a handful of others; common:
 * the bulk of standard messages; standard: a curated few more, e.g. GLOBAL_POSITION_INT;
 * ardupilotmega: ArduPilot-specific extensions).
 */
export const MAVLINK_REGISTRY: MavLinkPacketRegistry = {
  ...MINIMAL_REGISTRY,
  ...COMMON_REGISTRY,
  ...STANDARD_REGISTRY,
  ...ARDUPILOTMEGA_REGISTRY,
};
