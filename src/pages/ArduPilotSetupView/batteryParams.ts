// Real ArduPilot primary battery monitor param names, confirmed against ardupilot.org's own
// parameter docs and AP_BattMonitor/AP_BattMonitor_Params.cpp source. BATT_MONITOR and the two
// failsafe-action params are enum-typed - their real code->label lists come from
// fetchParamDocs (same mechanism MotorsCopterSection uses for FRAME_CLASS/FRAME_TYPE), not
// hardcoded here, since BATT_MONITOR alone has 30+ values and FS_LOW_ACT/FS_CRT_ACT's options
// differ by vehicle type.
export const BATTERY_PARAM_NAMES = [
  "BATT_MONITOR",
  "BATT_CAPACITY",
  "BATT_ARM_VOLT",
  "BATT_LOW_VOLT",
  "BATT_CRT_VOLT",
  "BATT_LOW_MAH",
  "BATT_CRT_MAH",
  "BATT_FS_LOW_ACT",
  "BATT_FS_CRT_ACT",
] as const;

export const BATTERY_ENUM_PARAMS = new Set(["BATT_MONITOR", "BATT_FS_LOW_ACT", "BATT_FS_CRT_ACT"]);
