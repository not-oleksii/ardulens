// Real ArduPilot on-screen-display (OSD) parameter names, confirmed against ArduCopter's own
// apm.pdef.xml (fetched from https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.xml,
// the same authoritative source ardupilotParamDocs.ts already uses) rather than assumed from
// memory - the naming is inconsistent enough (OSD1_BAT_VOLT_EN, not OSD1_BATVOLT_EN;
// OSD1_CELLVOLT_EN, not OSD1_CELL_VOLT_EN) that guessing would have produced parameter names
// that don't exist on a real vehicle. Screens 1-4 are the standard on-board OSD screens (X range
// 0-59, Y range 0-21, a character-grid position); OSD5/OSD6 are a separate "param watch" overlay
// feature (9 arbitrary-parameter slots each) out of scope here. OSD_TYPE2/second-OSD-backend
// support is also out of scope - this covers the single/primary OSD only.
export const OSD_SCREEN_NUMBERS = [1, 2, 3, 4] as const;
export type OsdScreenNumber = (typeof OSD_SCREEN_NUMBERS)[number];

export const OSD_GLOBAL_PARAM_NAMES = ["OSD_TYPE", "OSD_UNITS", "OSD_CHAN"] as const;
export const OSD_ENUM_PARAMS = new Set<string>(["OSD_TYPE", "OSD_UNITS"]);

export function osdScreenControlParamNames(screen: OsdScreenNumber): readonly [string, string, string] {
  return [`OSD${screen}_ENABLE`, `OSD${screen}_CHAN_MIN`, `OSD${screen}_CHAN_MAX`];
}

// Every element key ArduPilot exposes as an OSD{screen}_<KEY>_EN / _X / _Y triplet - identical
// set across all 4 screens. Order matches the pdef.xml's own declaration order.
export const OSD_ELEMENT_KEYS = [
  "ALTITUDE",
  "BAT_VOLT",
  "RSSI",
  "CURRENT",
  "BATUSED",
  "SATS",
  "FLTMODE",
  "MESSAGE",
  "GSPEED",
  "HORIZON",
  "HOME",
  "HEADING",
  "THROTTLE",
  "COMPASS",
  "WIND",
  "ASPEED",
  "VSPEED",
  "ESCTEMP",
  "ESCRPM",
  "ESCAMPS",
  "GPSLAT",
  "GPSLONG",
  "ROLL",
  "PITCH",
  "TEMP",
  "HDOP",
  "WAYPOINT",
  "XTRACK",
  "DIST",
  "STATS",
  "FLTIME",
  "CLIMBEFF",
  "EFF",
  "BTEMP",
  "ATEMP",
  "BAT2_VLT",
  "BAT2USED",
  "ASPD2",
  "ASPD1",
  "CLK",
  "SIDEBARS",
  "CRSSHAIR",
  "HOMEDIST",
  "HOMEDIR",
  "POWER",
  "CELLVOLT",
  "BATTBAR",
  "ARMING",
  "PLUSCODE",
  "CALLSIGN",
  "CURRENT2",
  "VTX_PWR",
  "TER_HGT",
  "AVGCELLV",
  "RESTVOLT",
  "FENCE",
  "RNGF",
  "ACRVOLT",
  "RPM",
  "LINK_Q",
  "RC_PWR",
  "RSSIDBM",
  "RC_SNR",
  "RC_ANT",
  "RC_LQ",
] as const;
export type OsdElementKey = (typeof OSD_ELEMENT_KEYS)[number];

export function osdElementParamName(screen: OsdScreenNumber, key: OsdElementKey, field: "EN" | "X" | "Y"): string {
  return `OSD${screen}_${key}_${field}`;
}

export function osdScreenElementParamNames(screen: OsdScreenNumber): string[] {
  return OSD_ELEMENT_KEYS.flatMap((key) => [
    osdElementParamName(screen, key, "EN"),
    osdElementParamName(screen, key, "X"),
    osdElementParamName(screen, key, "Y"),
  ]);
}

// camelCase i18n key per element, for ardupilotSetup.osdSetup.elements.<key> - same
// key-lookup-table pattern as labels.ts's SENSOR_KEYS/sensorLabel.
const ELEMENT_I18N_KEYS: Record<OsdElementKey, string> = {
  ALTITUDE: "altitude",
  BAT_VOLT: "batVolt",
  RSSI: "rssi",
  CURRENT: "current",
  BATUSED: "batUsed",
  SATS: "sats",
  FLTMODE: "fltMode",
  MESSAGE: "message",
  GSPEED: "gSpeed",
  HORIZON: "horizon",
  HOME: "home",
  HEADING: "heading",
  THROTTLE: "throttle",
  COMPASS: "compass",
  WIND: "wind",
  ASPEED: "aSpeed",
  VSPEED: "vSpeed",
  ESCTEMP: "escTemp",
  ESCRPM: "escRpm",
  ESCAMPS: "escAmps",
  GPSLAT: "gpsLat",
  GPSLONG: "gpsLong",
  ROLL: "roll",
  PITCH: "pitch",
  TEMP: "temp",
  HDOP: "hdop",
  WAYPOINT: "waypoint",
  XTRACK: "xtrack",
  DIST: "dist",
  STATS: "stats",
  FLTIME: "flTime",
  CLIMBEFF: "climbEff",
  EFF: "eff",
  BTEMP: "bTemp",
  ATEMP: "aTemp",
  BAT2_VLT: "bat2Vlt",
  BAT2USED: "bat2Used",
  ASPD2: "aSpd2",
  ASPD1: "aSpd1",
  CLK: "clk",
  SIDEBARS: "sidebars",
  CRSSHAIR: "crsshair",
  HOMEDIST: "homeDist",
  HOMEDIR: "homeDir",
  POWER: "power",
  CELLVOLT: "cellVolt",
  BATTBAR: "battBar",
  ARMING: "arming",
  PLUSCODE: "plusCode",
  CALLSIGN: "callsign",
  CURRENT2: "current2",
  VTX_PWR: "vtxPwr",
  TER_HGT: "terHgt",
  AVGCELLV: "avgCellV",
  RESTVOLT: "restVolt",
  FENCE: "fence",
  RNGF: "rngf",
  ACRVOLT: "acrVolt",
  RPM: "rpm",
  LINK_Q: "linkQ",
  RC_PWR: "rcPwr",
  RSSIDBM: "rssiDbm",
  RC_SNR: "rcSnr",
  RC_ANT: "rcAnt",
  RC_LQ: "rcLq",
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function osdElementLabel(t: Translate, key: OsdElementKey): string {
  return t(`ardupilotSetup.osdSetup.elements.${ELEMENT_I18N_KEYS[key]}`);
}

export function allOsdParamNames(): string[] {
  return [
    ...OSD_GLOBAL_PARAM_NAMES,
    ...OSD_SCREEN_NUMBERS.flatMap((screen) => [...osdScreenControlParamNames(screen), ...osdScreenElementParamNames(screen)]),
  ];
}
