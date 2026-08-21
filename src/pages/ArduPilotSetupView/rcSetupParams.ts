import type { ArduPilotVehicleFolder } from "../../services/ardupilotParamDocs/ardupilotParamDocs";

// Real, generic ArduPilot RC-input params (confirmed against ardupilot.org's own parameter
// docs: RC_Channel.cpp's aux-function system + AP_Arming/mode-switch handling, common-rcmap.html,
// and AP_Arming's throttle-failsafe params) - common across Copter/Plane/Rover/Sub/Tracker, not
// vehicle-specific like FRAME_CLASS was. FLTMODE_CH picks which RC channel drives mode
// switching; FLTMODE1-6 assign a mode to each of its 6 PWM bands (see rcBands.ts).
// RC1_OPTION..RC16_OPTION assign an aux function (Arm/Disarm, RTL, beeper mute, etc.) to any
// channel - the real enum is 150+ values and differs by firmware version, so it comes from
// fetchParamDocs (same mechanism MotorsCopterSection uses for FRAME_CLASS/TYPE), not hardcoded
// here. RCMAP_ROLL/PITCH/THROTTLE/YAW remap which physical channel drives each primary control
// axis (defaults 1/2/3/4) - like FRAME_CLASS, a reboot is required for a change to take effect.
export const FLIGHT_MODE_SLOT_NAMES = ["FLTMODE1", "FLTMODE2", "FLTMODE3", "FLTMODE4", "FLTMODE5", "FLTMODE6"] as const;

export const RC_OPTION_CHANNEL_COUNT = 16;
export const RC_OPTION_PARAM_NAMES = Array.from({ length: RC_OPTION_CHANNEL_COUNT }, (_, i) => `RC${i + 1}_OPTION`);

export const RCMAP_PARAM_NAMES = ["RCMAP_ROLL", "RCMAP_PITCH", "RCMAP_THROTTLE", "RCMAP_YAW"] as const;

// Failsafe params genuinely differ by vehicle family, not just in which ones exist but in their
// very names - confirmed against ArduCopter's and ArduPlane's own apm.pdef.xml. ArduPlane has no
// FS_THR_ENABLE at all (its throttle failsafe is just a PWM threshold, THR_FS_VALUE) and its GCS
// failsafe param is "FS_GCS_ENABL" (no trailing E) rather than Copter's "FS_GCS_ENABLE" - a real
// ArduPilot quirk, not a typo here. Plane also has a short/long failsafe action model
// (FS_SHORT_ACTN/FS_LONG_ACTN/FS_LONG_TIMEOUT) that Copter doesn't have.
export const FAILSAFE_PARAM_NAMES_COPTER = [
  "FS_THR_ENABLE",
  "FS_THR_VALUE",
  "FS_GCS_ENABLE",
  "FS_GCS_TIMEOUT",
  "FS_EKF_ACTION",
  "FS_EKF_THRESH",
  "FS_EKF_FILT",
  "FS_CRASH_CHECK",
  "FS_VIBE_ENABLE",
  "FS_DR_ENABLE",
  "FS_DR_TIMEOUT",
  "FS_OPTIONS",
] as const;

export const FAILSAFE_PARAM_NAMES_PLANE = [
  "THR_FS_VALUE",
  "FS_GCS_ENABL",
  "FS_SHORT_ACTN",
  "FS_LONG_ACTN",
  "FS_LONG_TIMEOUT",
  "FS_EKF_THRESH",
] as const;

// Rover/Sub/Tracker failsafe params haven't been confirmed against their own real docs yet -
// fall back to the one pair that's been in this codebase since before the vehicle-family split.
export const FAILSAFE_PARAM_NAMES_FALLBACK = ["FS_THR_ENABLE", "FS_THR_VALUE"] as const;

export function failsafeParamNamesFor(vehicleFolder: ArduPilotVehicleFolder): readonly string[] {
  if (vehicleFolder === "ArduCopter") return FAILSAFE_PARAM_NAMES_COPTER;
  if (vehicleFolder === "ArduPlane") return FAILSAFE_PARAM_NAMES_PLANE;
  return FAILSAFE_PARAM_NAMES_FALLBACK;
}

// The union of every vehicle family's failsafe param names, purely so RC_SETUP_PARAM_NAMES below
// can gate "has anything in this whole section loaded yet" without knowing the vehicle type -
// the actual per-vehicle list (failsafeParamNamesFor) is what RcSetupSection renders.
const FAILSAFE_PARAM_NAMES_ALL = Array.from(
  new Set<string>([...FAILSAFE_PARAM_NAMES_COPTER, ...FAILSAFE_PARAM_NAMES_PLANE, ...FAILSAFE_PARAM_NAMES_FALLBACK]),
);

export const RC_SETUP_PARAM_NAMES = [
  "FLTMODE_CH",
  ...FLIGHT_MODE_SLOT_NAMES,
  ...RC_OPTION_PARAM_NAMES,
  ...RCMAP_PARAM_NAMES,
  ...FAILSAFE_PARAM_NAMES_ALL,
];

export const RCMAP_AXIS_LABELS: Record<(typeof RCMAP_PARAM_NAMES)[number], string> = {
  RCMAP_ROLL: "Roll",
  RCMAP_PITCH: "Pitch",
  RCMAP_THROTTLE: "Throttle",
  RCMAP_YAW: "Yaw",
};
