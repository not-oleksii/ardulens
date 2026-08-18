/** One Cesium ion token covers both CesiumMapView's post-flight map and ArduPilotSetupView's live map. */
export const CESIUM_TOKEN_STORAGE_KEY = "ardulens.cesiumIonToken";

export const AIR_MODES: ReadonlySet<number> = new Set([4, 5, 15]); // ACRO, FBWA, GUIDED

/** ArduPilot Plane/QuadPlane flight mode numbers -> names, for the Graphs page's mode bands. */
export const PLANE_MODE_NAMES: Readonly<Record<number, string>> = {
  0: "MANUAL",
  1: "CIRCLE",
  2: "STABILIZE",
  3: "TRAINING",
  4: "ACRO",
  5: "FBWA",
  6: "FBWB",
  7: "CRUISE",
  8: "AUTOTUNE",
  10: "AUTO",
  11: "RTL",
  12: "LOITER",
  13: "TAKEOFF",
  14: "AVOID_ADSB",
  15: "GUIDED",
  17: "QSTABILIZE",
  18: "QHOVER",
  19: "QLOITER",
  20: "QLAND",
  21: "QRTL",
  22: "QAUTOTUNE",
  23: "QACRO",
  24: "THERMAL",
};
/** ArduCopter flight mode numbers -> names (Mode::Number enum, ArduCopter/mode.h) - used for the
 *  live PFD mode label and the Flight Modes setup dropdowns. Gaps (8, 10, 12) are unassigned
 *  numbers in the real firmware, not omissions here. */
export const COPTER_MODE_NAMES: Readonly<Record<number, string>> = {
  0: "STABILIZE",
  1: "ACRO",
  2: "ALT_HOLD",
  3: "AUTO",
  4: "GUIDED",
  5: "LOITER",
  6: "RTL",
  7: "CIRCLE",
  9: "LAND",
  11: "DRIFT",
  13: "SPORT",
  14: "FLIP",
  15: "AUTOTUNE",
  16: "POSHOLD",
  17: "BRAKE",
  18: "THROW",
  19: "AVOID_ADSB",
  20: "GUIDED_NOGPS",
  21: "SMART_RTL",
  22: "FLOWHOLD",
  23: "FOLLOW",
  24: "ZIGZAG",
  25: "SYSTEMID",
  26: "AUTOROTATE",
  27: "AUTO_RTL",
  28: "TURTLE",
};

export const AIRBORNE_SPEED = 10; // m/s -> considered flying
export const MAX_FROM_CENTER = 300_000; // 300 km -> reject cross-country teleports
export const MAX_STEP_SPEED = 150; // m/s -> reject impossible jumps between samples
// ArduPilot GPS_Status enum: 0=NO_GPS, 1=NO_FIX, 2=GPS_OK_FIX_2D, 3=GPS_OK_FIX_3D, 4+=DGPS/RTK.
// Below this, the receiver itself reports no usable fix - reject regardless of how
// plausible the position field still looks (it may just be holding a stale value).
export const MIN_USABLE_GPS_STATUS = 2;
export const CRASH_TAIL_MS = 10_000; // final window ignored for landing/sag (impact)
