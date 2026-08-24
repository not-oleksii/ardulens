// Offline fallback for the TUNE enum (ArduCopter's CH6/transmitter-tuning target parameter),
// same rationale as auxFunctionNames.ts's AUX_FUNCTION_NAMES_COPTER: LiveTuningSection normally
// fetches this list live from ArduPilot's own parameter docs (fetchParamDocs), which always wins
// once it loads, but that needs internet access a vehicle being configured in the field may not
// have. Without this fallback, TUNE's dropdown would show only bare numeric codes until the docs
// fetch succeeds.
//
// Snapshotted from https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.xml on
// 2026-08-24 by directly parsing the real pdef.xml (not paraphrased/guessed) - 37 real entries,
// confirmed as the complete list for this exact source file. Copter-only: Plane's transmitter
// tuning uses a structurally different TUNE_PARAM enum (see LiveTuningSection's own comment on
// why Plane is out of scope for now).
export const TUNE_PARAM_NAMES_COPTER: Readonly<Record<number, string>> = {
  0: "None",
  1: "Stab Roll/Pitch kP",
  3: "Stab Yaw kP",
  4: "Rate Roll/Pitch kP",
  5: "Rate Roll/Pitch kI",
  6: "Rate Yaw kP",
  7: "Throttle Rate kP",
  10: "WP Speed (4.6 and earlier)",
  12: "Loiter Pos kP",
  14: "AltHold kP",
  21: "Rate Roll/Pitch kD",
  22: "Velocity XY kP",
  25: "Acro Roll/Pitch deg/s",
  26: "Rate Yaw kD",
  28: "Velocity XY kI",
  34: "Throttle Accel kP",
  35: "Throttle Accel kI",
  36: "Throttle Accel kD",
  38: "Declination",
  39: "Circle Rate",
  40: "Acro Yaw deg/s",
  45: "RC Feel",
  46: "Rate Pitch kP",
  47: "Rate Pitch kI",
  48: "Rate Pitch kD",
  49: "Rate Roll kP",
  50: "Rate Roll kI",
  51: "Rate Roll kD",
  52: "Rate Pitch FF",
  53: "Rate Roll FF",
  54: "Rate Yaw FF",
  55: "Motor Yaw Headroom",
  56: "Rate Yaw Filter",
  58: "SysID Magnitude",
  59: "PSC Angle Max",
  60: "Loiter Speed",
  61: "WP Speed (m/s)",
};

// RC_Channel::AUX_FUNC's transmitter-tuning slot - RCx_OPTION set to this value on any channel
// makes that channel's PWM drive TUNE/TUNE_MIN/TUNE_MAX (confirmed against ArduCopter's own
// apm.pdef.xml documentation string for TUNE, see LiveTuningSection.tsx).
export const TUNE_RC_OPTION_CODE = 219;
