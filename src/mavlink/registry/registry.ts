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
// GLOBAL_POSITION_INT lives in the "standard" dialect file, not "common" - this package
// splits a curated subset of core messages there even though they're not ArduPilot-specific.
export { GlobalPositionInt } from "mavlink-mappings/dist/lib/standard";

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
