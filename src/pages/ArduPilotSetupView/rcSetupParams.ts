// Real, generic ArduPilot RC-input params (confirmed against ardupilot.org's own parameter
// docs: RC_Channel.cpp's aux-function system + AP_Arming/mode-switch handling) - common across
// Copter/Plane/Rover/Sub/Tracker, not vehicle-specific like FRAME_CLASS was. FLTMODE_CH picks
// which RC channel drives mode switching; FLTMODE1-6 assign a mode to each of its 6 PWM bands
// (see rcBands.ts). RC1_OPTION..RC16_OPTION assign an aux function (Arm/Disarm, RTL, beeper
// mute, etc.) to any channel - the real enum is 60+ values and differs by firmware version, so
// it comes from fetchParamDocs (same mechanism MotorsCopterSection uses for FRAME_CLASS/TYPE),
// not hardcoded here.
export const FLIGHT_MODE_SLOT_NAMES = ["FLTMODE1", "FLTMODE2", "FLTMODE3", "FLTMODE4", "FLTMODE5", "FLTMODE6"] as const;

export const RC_OPTION_CHANNEL_COUNT = 16;
export const RC_OPTION_PARAM_NAMES = Array.from({ length: RC_OPTION_CHANNEL_COUNT }, (_, i) => `RC${i + 1}_OPTION`);

export const RC_SETUP_PARAM_NAMES = ["FLTMODE_CH", ...FLIGHT_MODE_SLOT_NAMES, ...RC_OPTION_PARAM_NAMES];

export const RC_SETUP_ENUM_PARAMS = new Set<string>([...FLIGHT_MODE_SLOT_NAMES, ...RC_OPTION_PARAM_NAMES]);
