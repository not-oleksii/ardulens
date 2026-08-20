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
// FS_THR_ENABLE/FS_THR_VALUE are the RC-loss (throttle) failsafe settings.
export const FLIGHT_MODE_SLOT_NAMES = ["FLTMODE1", "FLTMODE2", "FLTMODE3", "FLTMODE4", "FLTMODE5", "FLTMODE6"] as const;

export const RC_OPTION_CHANNEL_COUNT = 16;
export const RC_OPTION_PARAM_NAMES = Array.from({ length: RC_OPTION_CHANNEL_COUNT }, (_, i) => `RC${i + 1}_OPTION`);

export const RCMAP_PARAM_NAMES = ["RCMAP_ROLL", "RCMAP_PITCH", "RCMAP_THROTTLE", "RCMAP_YAW"] as const;

export const FAILSAFE_PARAM_NAMES = ["FS_THR_ENABLE", "FS_THR_VALUE"] as const;

export const RC_SETUP_PARAM_NAMES = [
  "FLTMODE_CH",
  ...FLIGHT_MODE_SLOT_NAMES,
  ...RC_OPTION_PARAM_NAMES,
  ...RCMAP_PARAM_NAMES,
  ...FAILSAFE_PARAM_NAMES,
];

export const RC_SETUP_ENUM_PARAMS = new Set<string>([...FLIGHT_MODE_SLOT_NAMES, ...RC_OPTION_PARAM_NAMES, "FS_THR_ENABLE"]);

/** A channel-assignable "function" the left-hand list offers - either a special slot
 *  (flight-mode channel, or a primary-axis RCMAP) or a specific RCx_OPTION aux function code.
 *  Selecting one, then clicking a channel's live bar, assigns it there. */
export type AssignableFunction =
  | { kind: "fltmodeChannel" }
  | { kind: "rcmap"; param: (typeof RCMAP_PARAM_NAMES)[number]; axisLabel: string }
  | { kind: "option"; code: number; label: string };

export const RCMAP_AXIS_LABELS: Record<(typeof RCMAP_PARAM_NAMES)[number], string> = {
  RCMAP_ROLL: "Roll",
  RCMAP_PITCH: "Pitch",
  RCMAP_THROTTLE: "Throttle",
  RCMAP_YAW: "Yaw",
};
