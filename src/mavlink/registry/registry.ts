// Deep-imported from the specific dialect submodules, never from the "mavlink-mappings"
// package root - the root barrel re-exports "mavlink-mappings-gen" (a Node/XML code-gen
// tool with dependencies like xml2js/ts-node that don't belong in a browser bundle). These
// submodule files are pure TS/JS with zero Node built-ins.
import { REGISTRY as MINIMAL_REGISTRY } from "mavlink-mappings/dist/lib/minimal";
import { REGISTRY as COMMON_REGISTRY } from "mavlink-mappings/dist/lib/common";
import { REGISTRY as STANDARD_REGISTRY } from "mavlink-mappings/dist/lib/standard";
import { REGISTRY as ARDUPILOTMEGA_REGISTRY } from "mavlink-mappings/dist/lib/ardupilotmega";
import type { MavLinkPacketRegistry } from "mavlink-mappings/dist/lib/mavlink";

export { Heartbeat } from "mavlink-mappings/dist/lib/minimal";
export { MavAutopilot, MavModeFlag, MavState, MavType } from "mavlink-mappings/dist/lib/minimal";
export { Attitude, GpsRawInt, GpsFixType, RequestDataStream, SysStatus, VfrHud } from "mavlink-mappings/dist/lib/common";
export { MavDataStream } from "mavlink-mappings/dist/lib/common";
export { MavParamType, ParamRequestList, ParamRequestRead, ParamSet, ParamValue } from "mavlink-mappings/dist/lib/common";
export { CommandAck, MavResult, MagCalReport, MagCalStatus } from "mavlink-mappings/dist/lib/common";
// GLOBAL_POSITION_INT lives in the "standard" dialect file, not "common" - this package
// splits a curated subset of core messages there even though they're not ArduPilot-specific.
export { GlobalPositionInt } from "mavlink-mappings/dist/lib/standard";
// MAG_CAL_PROGRESS and the DO_START/ACCEPT/CANCEL_MAG_CAL commands are ArduPilot-specific
// (not in vanilla MAVLink common), so they live in the ardupilotmega dialect file. The three
// commands are typed COMMAND_LONG wrappers (MSG_ID 76) with their `command` field defaulted
// to the right MAV_CMD id by their constructors - not distinct message ids of their own.
export { MagCalProgress, DoStartMagCalCommand, DoAcceptMagCalCommand, DoCancelMagCalCommand } from "mavlink-mappings/dist/lib/ardupilotmega";
// The ardupilotmega dialect's MavCmd is common's MavCmd extended with ArduPilot-specific
// commands (e.g. DO_START_MAG_CAL) - common's own MavCmd doesn't have those, so this is the
// one to use whenever an ArduPilot-specific command id needs comparing (e.g. a COMMAND_ACK).
export { MavCmd } from "mavlink-mappings/dist/lib/ardupilotmega";

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
