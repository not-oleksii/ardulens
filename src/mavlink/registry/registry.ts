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
export { Attitude, GpsRawInt, Gps2Raw, GpsFixType, RequestDataStream, SysStatus, VfrHud } from "mavlink-mappings/dist/lib/common";
// VIBRATION (MSG_ID 241) reports per-axis accelerometer vibration levels (m/s/s) plus a
// cumulative clipping event count per axis - lives in the common dialect, confirmed against
// MAVLink's own common.xml.
export { Vibration } from "mavlink-mappings/dist/lib/common";
export { MavDataStream } from "mavlink-mappings/dist/lib/common";
export { MavParamType, ParamRequestList, ParamRequestRead, ParamSet, ParamValue } from "mavlink-mappings/dist/lib/common";
export { CommandAck, MavResult, MagCalReport, MagCalStatus } from "mavlink-mappings/dist/lib/common";
// PREFLIGHT_CALIBRATION (COMMAND_LONG wrapper) triggers accelerometer calibration - its
// `accelerometer` field (param5) selects which kind: FULL=1 (6-position), TRIM=2 (single-
// position board-level cal), SIMPLE=4 - real codes confirmed against MAVLink's own common.xml
// (<enum name="PREFLIGHT_CALIBRATION_ACCELEROMETER">), not guessed.
export { PreflightCalibrationCommand } from "mavlink-mappings/dist/lib/common";
// PREFLIGHT_REBOOT_SHUTDOWN (MAV_CMD 246) reboots the flight controller - needed after
// changing a RebootRequired param like FRAME_CLASS/FRAME_TYPE. `autopilot` (param1) is the
// REBOOT_SHUTDOWN_ACTION for the autopilot component specifically (REBOOT=1) - real codes
// confirmed against MAVLink's own common.xml, not guessed.
export { PreflightRebootShutdownCommand, RebootShutdownAction } from "mavlink-mappings/dist/lib/common";
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
// RC_CHANNELS reports the receiver's raw per-channel PWM (chan1Raw..chan18Raw, us) plus
// chancount - the live input side of the RC link, distinct from SERVO_OUTPUT_RAW's output
// side above. `invalid="UINT16_MAX"` per-channel (confirmed against MAVLink's own common.xml)
// marks a channel as unused, not 0.
export { RcChannels } from "mavlink-mappings/dist/lib/common";
// The LOG_* microservice (MSG_ID 117-120) lists and downloads ArduPilot's own onboard DataFlash
// logs: LOG_REQUEST_LIST/LOG_ENTRY enumerate what's stored, LOG_REQUEST_DATA/LOG_DATA transfer
// one log's raw bytes in ~90-byte chunks - confirmed against MAVLink's own common.xml. Like this
// app's other multi-packet flows (mag cal, accel cal, RC cal, the FTP-based param-defaults
// download), chunks are assumed to arrive in offset order with nothing dropped - true for the
// local serial/UDP links this app targets, not an oversight.
export { LogData, LogEntry, LogRequestData, LogRequestList } from "mavlink-mappings/dist/lib/common";
// The MISSION_* microservice (MSG_ID 40-47, 51, 73) lists/uploads/downloads a stored mission,
// geofence, or rally-points list, per https://mavlink.io/en/services/mission.html and confirmed
// against MAVLink's own common.xml. Uses the modern `_INT` item variant (int32 lat/lon * 1e7,
// like GLOBAL_POSITION_INT) rather than the deprecated float-precision MISSION_ITEM - real GCS's
// (Mission Planner, QGroundControl) both default to `_INT` now. Unlike this app's other
// multi-packet protocols (params, DataFlash logs, FTP), the mission protocol is inherently
// request-response PER ITEM (GCS requests seq N, vehicle answers seq N, GCS requests seq N+1),
// not a burst - so there's no gap-filling/reordering concern to begin with, by design of the
// protocol itself. `missionType` (MavMissionType) selects which list: MISSION (the flight plan),
// FENCE, or RALLY - all three share these exact same messages.
export {
  MavMissionResult,
  MavMissionType,
  MissionAck,
  MissionClearAll,
  MissionCount,
  MissionCurrent,
  MissionItemInt,
  MissionItemReached,
  MissionRequestInt,
  MissionRequestList,
} from "mavlink-mappings/dist/lib/common";
// MavFrame.GLOBAL_RELATIVE_ALT (altitude relative to home) is the standard frame real GCS's use
// for waypoints - confirmed against MAVLink's own common.xml (<enum name="MAV_FRAME">).
export { MavFrame } from "mavlink-mappings/dist/lib/common";
// FILE_TRANSFER_PROTOCOL (MSG_ID 110) is ArduPilot's MAVLink FTP microservice - the only real
// mechanism it exposes for parameter DEFAULT values (confirmed: neither PARAM_VALUE nor the
// apm.pdef.xml docs carry a default). `payload` (uint8_t[251]) carries a 12-byte PayloadHeader
// (seq/session/opcode/size/req_opcode/burst_complete/offset) plus up to 239 bytes of data, per
// https://mavlink.io/en/services/ftp.html - encoded/decoded by mavFtpCodec.ts, not by this
// package's own field codec (the payload is opaque uint8_t[] as far as MAVLink itself is
// concerned). MavFtpOpcode/MavFtpErr are this session's own re-verified (against the package's
// raw common.d.ts/common.js, not a paraphrase) exact enum members for that sub-protocol.
export { FileTransferProtocol, MavFtpOpcode, MavFtpErr } from "mavlink-mappings/dist/lib/common";
// GLOBAL_POSITION_INT lives in the "standard" dialect file, not "common" - this package
// splits a curated subset of core messages there even though they're not ArduPilot-specific.
export { GlobalPositionInt } from "mavlink-mappings/dist/lib/standard";
// STATUSTEXT carries ArduPilot's human-readable messages, including its prearm-failure reasons
// (e.g. "PreArm: Compass not calibrated") - the only place those reasons appear at all, since a
// rejected arm COMMAND_ACK only carries a generic MAV_RESULT code. `id`/`chunkSeq` support
// reassembling a message split across multiple STATUSTEXT packets - this app treats every
// message as a single chunk (id=0, the overwhelmingly common case for ArduPilot's own short
// messages) rather than implementing full reassembly, matching this app's already-accepted "no
// exotic retry/reorder handling" scope for other multi-packet flows (see mavFtpCodec.ts).
export { StatusText, MavSeverity } from "mavlink-mappings/dist/lib/common";
// SYS_STATUS's onboard_control_sensors_present/enabled/health fields are each a bitmask of
// this enum - `present` says which sensors the vehicle actually has, `health` says which of
// those are currently OK. PREARM_CHECK is not a physical sensor but ArduPilot's own summary
// "would pre-arm checks pass right now" bit - confirmed against MAVLink's own common.xml
// (<enum name="MAV_SYS_STATUS_SENSOR">), not guessed.
export { MavSysStatusSensor } from "mavlink-mappings/dist/lib/common";
// COMPONENT_ARM_DISARM (MAV_CMD 400, COMMAND_LONG wrapper) arms/disarms the vehicle - `arm`
// (param1) is 1/0, `force` (param2) is 0 for a normal request (still subject to pre-arm
// checks) or the documented magic value 21196 to force through them. This app only ever sends
// a normal (non-forced) request - forcing past safety checks is a deliberate expert-only
// escape hatch real GCS's gate behind extra confirmation, out of scope here.
export { ComponentArmDisarmCommand } from "mavlink-mappings/dist/lib/common";
// SET_MODE (MSG_ID 11) - unlike every other command in this file, this is a plain message, not
// a COMMAND_LONG wrapper, and ArduPilot never COMMAND_ACKs it - the UI confirms a mode change
// took effect by watching the vehicle's own next HEARTBEAT.custom_mode instead (already tracked
// in mavlinkVehicleStore). `baseMode` must carry MavModeFlag.CUSTOM_MODE_ENABLED for ArduPilot
// to read `customMode` at all - confirmed against ArduPilot's own GCS_Common.cpp
// handle_message(SET_MODE), which ignores the message entirely otherwise.
export { SetMode } from "mavlink-mappings/dist/lib/common";
// MavMode is a distinct branded type from MavModeFlag despite sharing the same bit meanings on
// the wire (SET_MODE.base_mode is typed against it, HEARTBEAT.base_mode against MavModeFlag) -
// exported so callers can cast a MavModeFlag bitmask into it without reaching past this file.
export type { MavMode } from "mavlink-mappings/dist/lib/common";
// MAG_CAL_PROGRESS and the DO_START/ACCEPT/CANCEL_MAG_CAL commands are ArduPilot-specific
// (not in vanilla MAVLink common), so they live in the ardupilotmega dialect file. The three
// commands are typed COMMAND_LONG wrappers (MSG_ID 76) with their `command` field defaulted
// to the right MAV_CMD id by their constructors - not distinct message ids of their own.
export { MagCalProgress, DoStartMagCalCommand, DoAcceptMagCalCommand, DoCancelMagCalCommand } from "mavlink-mappings/dist/lib/ardupilotmega";
// ACCELCAL_VEHICLE_POS (MAV_CMD 42429) is sent BOTH directions during the 6-position accel
// cal: vehicle -> GCS tells the user what position to put the vehicle in next; GCS -> vehicle
// (echoing the same position back) confirms the vehicle is now actually in it, advancing the
// vehicle to the next position - confirmed against MAVLink's own ardupilotmega.xml, which
// documents this exact bidirectional meaning (not a guess or an assumption from R5's mag-cal
// pattern, which is unidirectional by contrast).
export { AccelcalVehiclePos, AccelcalVehiclePosCommand } from "mavlink-mappings/dist/lib/ardupilotmega";
// EKF_STATUS_REPORT (MSG_ID 193) is ArduPilot-specific (not vanilla MAVLink common), so it lives
// in the ardupilotmega dialect. Its variance fields are normalized so ~1.0 is AP_NavEKF's own
// "degraded estimate" boundary (the same threshold its internal innovation-ratio checks gate
// on), not an arbitrary UI-picked number - confirmed against ardupilotmega.xml.
export { EkfStatusReport } from "mavlink-mappings/dist/lib/ardupilotmega";
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
