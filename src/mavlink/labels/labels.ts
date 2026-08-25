import { COPTER_MODE_NAMES, PLANE_MODE_NAMES } from "../../constants";
import { vehicleFolderForMavType } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import {
  AccelcalVehiclePos,
  GpsFixType,
  MagCalStatus,
  MavAutopilot,
  MavCmd,
  MavResult,
  MavState,
  MavSysStatusSensor,
  MavType,
} from "../registry/registry";

type Translate = (key: string, options?: Record<string, unknown>) => string;

const TYPE_KEYS: Partial<Record<MavType, string>> = {
  [MavType.GENERIC]: "generic",
  [MavType.FIXED_WING]: "fixedWing",
  [MavType.QUADROTOR]: "quadrotor",
  [MavType.COAXIAL]: "coaxial",
  [MavType.HELICOPTER]: "helicopter",
  [MavType.ANTENNA_TRACKER]: "antennaTracker",
  [MavType.GROUND_ROVER]: "groundRover",
  [MavType.SURFACE_BOAT]: "surfaceBoat",
  [MavType.SUBMARINE]: "submarine",
  [MavType.HEXAROTOR]: "hexarotor",
  [MavType.OCTOROTOR]: "octorotor",
  [MavType.TRICOPTER]: "tricopter",
};

const AUTOPILOT_KEYS: Partial<Record<MavAutopilot, string>> = {
  [MavAutopilot.GENERIC]: "generic",
  [MavAutopilot.ARDUPILOTMEGA]: "ardupilotmega",
  [MavAutopilot.PX4]: "px4",
  [MavAutopilot.INVALID]: "invalid",
};

const STATE_KEYS: Partial<Record<MavState, string>> = {
  [MavState.UNINIT]: "uninit",
  [MavState.BOOT]: "boot",
  [MavState.CALIBRATING]: "calibrating",
  [MavState.STANDBY]: "standby",
  [MavState.ACTIVE]: "active",
  [MavState.CRITICAL]: "critical",
  [MavState.EMERGENCY]: "emergency",
  [MavState.POWEROFF]: "poweroff",
  [MavState.FLIGHT_TERMINATION]: "flightTermination",
};

export function mavTypeLabel(t: Translate, type: MavType): string {
  const key = TYPE_KEYS[type];
  return key ? t(`ardupilotSetup.vehicle.types.${key}`) : t("ardupilotSetup.vehicle.types.unknown", { value: type });
}

export function mavAutopilotLabel(t: Translate, autopilot: MavAutopilot): string {
  const key = AUTOPILOT_KEYS[autopilot];
  return key
    ? t(`ardupilotSetup.vehicle.autopilots.${key}`)
    : t("ardupilotSetup.vehicle.autopilots.unknown", { value: autopilot });
}

export function mavStateLabel(t: Translate, state: MavState): string {
  const key = STATE_KEYS[state];
  return key ? t(`ardupilotSetup.vehicle.states.${key}`) : t("ardupilotSetup.vehicle.states.unknown", { value: state });
}

/** Resolves a HEARTBEAT's raw custom_mode into its ArduPilot mode name, for whichever vehicle
 *  family `type` belongs to (Copter/Plane each have their own numbered mode table, see
 *  constants.ts) - falls back to the raw number for vehicle families without a known table
 *  (Rover/Sub/AntennaTracker aren't currently tabulated) or an unrecognized mode index. Shared
 *  by TelemetrySection and VehicleStatusBar so both show the exact same mode name. */
export function flightModeLabel(type: MavType, customMode: number): string {
  const folder = vehicleFolderForMavType(type);
  const names = folder === "ArduPlane" ? PLANE_MODE_NAMES : folder === "ArduCopter" ? COPTER_MODE_NAMES : null;
  return names?.[customMode] ?? String(customMode);
}

/** The RTL custom_mode number for whichever vehicle family `type` belongs to - null for a
 *  family without a known mode table (see flightModeLabel's own comment), so callers can hide
 *  an "RTL" quick-action rather than sending a mode number that isn't actually RTL there. */
export function rtlModeNumber(type: MavType): number | null {
  const folder = vehicleFolderForMavType(type);
  if (folder === "ArduPlane") return 11;
  if (folder === "ArduCopter") return 6;
  return null;
}

const GPS_FIX_KEYS: Partial<Record<GpsFixType, string>> = {
  [GpsFixType.NO_GPS]: "noGps",
  [GpsFixType.NO_FIX]: "noFix",
  [GpsFixType.GPS_FIX_TYPE_2D_FIX]: "fix2d",
  [GpsFixType.GPS_FIX_TYPE_3D_FIX]: "fix3d",
  [GpsFixType.DGPS]: "dgps",
  [GpsFixType.RTK_FLOAT]: "rtkFloat",
  [GpsFixType.RTK_FIXED]: "rtkFixed",
  [GpsFixType.STATIC]: "static",
  [GpsFixType.PPP]: "ppp",
};

export function gpsFixTypeLabel(t: Translate, fixType: GpsFixType): string {
  const key = GPS_FIX_KEYS[fixType];
  return key
    ? t(`ardupilotSetup.telemetry.gpsFix.${key}`)
    : t("ardupilotSetup.telemetry.gpsFix.unknown", { value: fixType });
}

const MAG_CAL_STATUS_KEYS: Partial<Record<MagCalStatus, string>> = {
  [MagCalStatus.NOT_STARTED]: "notStarted",
  [MagCalStatus.WAITING_TO_START]: "waitingToStart",
  [MagCalStatus.RUNNING_STEP_ONE]: "runningStepOne",
  [MagCalStatus.RUNNING_STEP_TWO]: "runningStepTwo",
  [MagCalStatus.SUCCESS]: "success",
  [MagCalStatus.FAILED]: "failed",
  [MagCalStatus.BAD_ORIENTATION]: "badOrientation",
  [MagCalStatus.BAD_RADIUS]: "badRadius",
};

export function magCalStatusLabel(t: Translate, status: MagCalStatus): string {
  const key = MAG_CAL_STATUS_KEYS[status];
  return key
    ? t(`ardupilotSetup.compassCal.status.${key}`)
    : t("ardupilotSetup.compassCal.status.unknown", { value: status });
}

const MAV_RESULT_KEYS: Partial<Record<MavResult, string>> = {
  [MavResult.ACCEPTED]: "accepted",
  [MavResult.TEMPORARILY_REJECTED]: "temporarilyRejected",
  [MavResult.DENIED]: "denied",
  [MavResult.UNSUPPORTED]: "unsupported",
  [MavResult.FAILED]: "failed",
  [MavResult.IN_PROGRESS]: "inProgress",
  [MavResult.CANCELLED]: "cancelled",
};

export function mavResultLabel(t: Translate, result: MavResult): string {
  const key = MAV_RESULT_KEYS[result];
  return key ? t(`ardupilotSetup.compassCal.result.${key}`) : t("ardupilotSetup.compassCal.result.unknown", { value: result });
}

/** Labels the 3 commands `flightCommandAck` (mavlinkVehicleStore) ever carries, reusing the
 *  same action names LiveMapSection's own buttons/menu items already use rather than inventing
 *  new copy for the same action - shared between that inline rejection banner and Wave 3's
 *  toast feedback for the same event. */
export function flightCommandLabel(t: Translate, command: MavCmd): string {
  if (command === MavCmd.NAV_TAKEOFF) return t("ardupilotSetup.map.takeoff");
  if (command === MavCmd.DO_REPOSITION) return t("ardupilotSetup.map.flyToHere");
  if (command === MavCmd.DO_SET_HOME) return t("ardupilotSetup.map.setHomeHere");
  return String(command);
}

const ACCELCAL_POS_KEYS: Partial<Record<number, string>> = {
  [AccelcalVehiclePos.LEVEL]: "level",
  [AccelcalVehiclePos.LEFT]: "left",
  [AccelcalVehiclePos.RIGHT]: "right",
  [AccelcalVehiclePos.NOSEDOWN]: "nosedown",
  [AccelcalVehiclePos.NOSEUP]: "noseup",
  [AccelcalVehiclePos.BACK]: "back",
};

/** Human label for one of the 6 accel-cal positions - SUCCESS/FAILED aren't positions to
 *  display here, they're the terminal states handled separately by the caller. */
export function accelcalVehiclePosLabel(t: Translate, position: number): string {
  const key = ACCELCAL_POS_KEYS[position];
  return key ? t(`ardupilotSetup.accelCal.position.${key}`) : t("ardupilotSetup.accelCal.position.unknown", { value: position });
}

// Every MAV_SYS_STATUS_SENSOR member EXCEPT PREARM_CHECK (shown as its own dedicated
// "checks passing/failing" badge, not a physical sensor - see VehicleHealthSection.tsx) and
// EXTENSION_USED (a meta bit marking the extended fields in use, not a sensor of its own).
const SENSOR_KEYS: Partial<Record<MavSysStatusSensor, string>> = {
  [MavSysStatusSensor.SENSOR_3D_GYRO]: "gyro",
  [MavSysStatusSensor.SENSOR_3D_ACCEL]: "accel",
  [MavSysStatusSensor.SENSOR_3D_MAG]: "mag",
  [MavSysStatusSensor.SENSOR_ABSOLUTE_PRESSURE]: "baro",
  [MavSysStatusSensor.SENSOR_DIFFERENTIAL_PRESSURE]: "airspeed",
  [MavSysStatusSensor.SENSOR_GPS]: "gps",
  [MavSysStatusSensor.SENSOR_OPTICAL_FLOW]: "opticalFlow",
  [MavSysStatusSensor.SENSOR_VISION_POSITION]: "visionPosition",
  [MavSysStatusSensor.SENSOR_LASER_POSITION]: "laserPosition",
  [MavSysStatusSensor.SENSOR_EXTERNAL_GROUND_TRUTH]: "externalGroundTruth",
  [MavSysStatusSensor.SENSOR_ANGULAR_RATE_CONTROL]: "rateControl",
  [MavSysStatusSensor.SENSOR_ATTITUDE_STABILIZATION]: "attitudeStabilization",
  [MavSysStatusSensor.SENSOR_YAW_POSITION]: "yawPosition",
  [MavSysStatusSensor.SENSOR_Z_ALTITUDE_CONTROL]: "altitudeControl",
  [MavSysStatusSensor.SENSOR_XY_POSITION_CONTROL]: "positionControl",
  [MavSysStatusSensor.SENSOR_MOTOR_OUTPUTS]: "motorOutputs",
  [MavSysStatusSensor.SENSOR_RC_RECEIVER]: "rcReceiver",
  [MavSysStatusSensor.SENSOR_3D_GYRO2]: "gyro2",
  [MavSysStatusSensor.SENSOR_3D_ACCEL2]: "accel2",
  [MavSysStatusSensor.SENSOR_3D_MAG2]: "mag2",
  [MavSysStatusSensor.GEOFENCE]: "geofence",
  [MavSysStatusSensor.AHRS]: "ahrs",
  [MavSysStatusSensor.TERRAIN]: "terrain",
  [MavSysStatusSensor.REVERSE_MOTOR]: "reverseMotor",
  [MavSysStatusSensor.LOGGING]: "logging",
  [MavSysStatusSensor.SENSOR_BATTERY]: "battery",
  [MavSysStatusSensor.SENSOR_PROXIMITY]: "proximity",
  [MavSysStatusSensor.SENSOR_SATCOM]: "satcom",
  [MavSysStatusSensor.OBSTACLE_AVOIDANCE]: "obstacleAvoidance",
  [MavSysStatusSensor.SENSOR_PROPULSION]: "propulsion",
};

export function sensorLabel(t: Translate, sensor: MavSysStatusSensor): string {
  const key = SENSOR_KEYS[sensor];
  return key ? t(`ardupilotSetup.health.sensors.${key}`) : t("ardupilotSetup.health.sensors.unknown", { value: sensor });
}

/** A likely cause + fix for one unhealthy sensor bit, for the hover hint on VehicleHealthSection's
 *  failure badges - grounded in ArduPilot's own real prearm-check/sensor-health behavior (e.g.
 *  YAW_POSITION failing is almost always an uncalibrated/interfered compass, not a "yaw sensor"
 *  of its own - ArduPilot has no such discrete hardware), not generic troubleshooting copy.
 *  Returns null for a sensor bit with no known cause/fix text (currently none, kept for the same
 *  "unknown code stays representable" fallback pattern sensorLabel uses). */
export function sensorHint(t: Translate, sensor: MavSysStatusSensor): { cause: string; fix: string } | null {
  const key = SENSOR_KEYS[sensor];
  if (!key) return null;
  return { cause: t(`ardupilotSetup.health.hints.${key}.cause`), fix: t(`ardupilotSetup.health.hints.${key}.fix`) };
}
