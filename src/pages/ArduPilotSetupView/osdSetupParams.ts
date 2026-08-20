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
export const OSD_ENUM_PARAMS = new Set<string>(["OSD_TYPE", "OSD_UNITS", "OSD_CHAN"]);

// Hardcoded fallback enum labels for the 3 global params, confirmed against ArduCopter's own
// apm.pdef.xml - used whenever fetchParamDocs hasn't returned yet (or failed, e.g. offline)
// so these never render as an unbounded, context-free number spinner. docs (when available)
// still take priority, since a differently-versioned firmware could define more values than
// this fixed reference copy knows about - see OsdSetupSection's enumField.
export const OSD_TYPE_FALLBACK_VALUES: Record<number, string> = {
  0: "None",
  1: "MAX7456",
  2: "SITL",
  3: "MSP",
  4: "TXONLY",
  5: "MSP_DISPLAYPORT",
};

export const OSD_UNITS_FALLBACK_VALUES: Record<number, string> = {
  0: "Metric",
  1: "Imperial",
  2: "SI",
  3: "Aviation",
};

// 1-4 are deliberately absent - real ArduPilot reserves those for the primary flight-control
// channels (roll/pitch/throttle/yaw), never assignable to an aux function like this one.
export const OSD_CHAN_FALLBACK_VALUES: Record<number, string> = {
  0: "Disable",
  5: "Chan5",
  6: "Chan6",
  7: "Chan7",
  8: "Chan8",
  9: "Chan9",
  10: "Chan10",
  11: "Chan11",
  12: "Chan12",
  13: "Chan13",
  14: "Chan14",
  15: "Chan15",
  16: "Chan16",
};

export function osdScreenControlParamNames(screen: OsdScreenNumber): readonly [string, string, string] {
  return [`OSD${screen}_ENABLE`, `OSD${screen}_CHAN_MIN`, `OSD${screen}_CHAN_MAX`];
}

// The on-screen character grid every element's X/Y is positioned within - matches the real
// OSD1_ALTITUDE_X/_Y <field name="Range"> values from apm.pdef.xml (0-59, 0-21), i.e. a 60x22
// character grid. Used both to size the visual drag-and-drop layout panel and to clamp
// drag/quick-position writes to values the vehicle will actually accept.
export const OSD_GRID_COLS = 60;
export const OSD_GRID_ROWS = 22;

export function clampOsdX(x: number): number {
  return Math.min(OSD_GRID_COLS - 1, Math.max(0, Math.round(x)));
}

export function clampOsdY(y: number): number {
  return Math.min(OSD_GRID_ROWS - 1, Math.max(0, Math.round(y)));
}

// Real MAX7456 hardware (analog OSD_TYPE=1) physically only has 30 character columns, and
// either 16 rows (PAL) or 13 rows (NTSC) - fixed by the chip itself, confirmed against Maxim's
// own MAX7456 datasheet, not assumed. ArduPilot's X/Y parameters still accept the full 0-59/0-21
// range on an analog board (nothing stops you from *setting* OSD1_ALTITUDE_X=45), but an element
// placed past column 29 or row 15/12 simply never appears on screen - so the visual preview
// marks this real hardware limit rather than implying the full parameter range is always visible.
export const ANALOG_SAFE_COLS = 30;
export const ANALOG_SAFE_ROWS_NTSC = 13;
export const ANALOG_SAFE_ROWS_PAL = 16;

// A digital/MSP DisplayPort screen's real visible grid when OSD{n}_TXT_RES=1 ("HD" text
// resolution) - confirmed against Mission Planner's own OSD layout editor, which draws this
// exact 50x18 box (labelled "50x18" in its own UI) inside the full 60x22 parameter range for a
// real vehicle's Screen 1 with OSD1_TXT_RES=1. TXT_RES=0 ("SD") isn't covered here - Mission
// Planner's own editor wasn't checked against a real SD-digital screen, so that case is left as
// the generic full-range preview rather than guessing a size.
export const DIGITAL_HD_COLS = 50;
export const DIGITAL_HD_ROWS = 18;

export type OsdPreviewKind = "analog" | "digital" | "generic";

// OSD_TYPE codes, per OSD_TYPE_FALLBACK_VALUES above: 1=MAX7456 is the one case with a
// confidently-known physical character grid (real analog hardware). 3=MSP and 5=MSP_DISPLAYPORT
// are digital/canvas systems (e.g. Walksnail, HDZero, DJI O3) whose actual resolution is
// negotiated with the goggles/VTX at runtime over MSP. 0=None/2=SITL/4=TXONLY aren't real
// physical displays this app can characterize, so they fall back to the generic full
// parameter-range preview.
export function osdPreviewKind(osdType: number | undefined): OsdPreviewKind {
  if (osdType === 1) return "analog";
  if (osdType === 3 || osdType === 5) return "digital";
  return "generic";
}

// The real visible character grid to overlay inside the full 60x22 parameter range, or null when
// there's no confidently-known size for this combination (in which case the preview shows the
// full range with no overlay, rather than a fabricated box). See DIGITAL_HD_COLS/ROWS's own
// comment for where the digital HD size comes from.
export function osdVisibleSafeArea(osdType: number | undefined, txtRes: number | undefined): { cols: number; rows: number } | null {
  if (osdType === 1) return { cols: ANALOG_SAFE_COLS, rows: ANALOG_SAFE_ROWS_PAL };
  if ((osdType === 3 || osdType === 5) && txtRes === 1) return { cols: DIGITAL_HD_COLS, rows: DIGITAL_HD_ROWS };
  return null;
}

// A Betaflight/INAV-style 3x3 "quick position" preset - snaps an element to one of the 9
// obvious screen anchors instead of hand-typing X/Y. The margins are a fixed best-effort inset,
// not an exact flush-right/flush-bottom fit: real element text width varies by value and by
// OSD_UNITS (imperial vs metric changes digit count), so there's no single X that's truly
// "flush right" for every element.
export const ALIGNMENT_ANCHORS = [
  "topLeft",
  "topCenter",
  "topRight",
  "centerLeft",
  "center",
  "centerRight",
  "bottomLeft",
  "bottomCenter",
  "bottomRight",
] as const;
export type AlignmentAnchor = (typeof ALIGNMENT_ANCHORS)[number];

const ALIGNMENT_X_MARGIN = 2;
const ALIGNMENT_Y_MARGIN = 1;

export function alignmentPosition(anchor: AlignmentAnchor): { x: number; y: number } {
  const [vertical, horizontal] = anchor === "center" ? (["center", "center"] as const) : splitAnchor(anchor);
  const x =
    horizontal === "left" ? ALIGNMENT_X_MARGIN : horizontal === "right" ? OSD_GRID_COLS - 1 - ALIGNMENT_X_MARGIN : Math.round((OSD_GRID_COLS - 1) / 2);
  const y =
    vertical === "top" ? ALIGNMENT_Y_MARGIN : vertical === "bottom" ? OSD_GRID_ROWS - 1 - ALIGNMENT_Y_MARGIN : Math.round((OSD_GRID_ROWS - 1) / 2);
  return { x, y };
}

function splitAnchor(anchor: Exclude<AlignmentAnchor, "center">): readonly ["top" | "center" | "bottom", "left" | "center" | "right"] {
  const vertical = anchor.startsWith("top") ? "top" : anchor.startsWith("bottom") ? "bottom" : "center";
  const horizontal = anchor.endsWith("Left") ? "left" : anchor.endsWith("Right") ? "right" : "center";
  return [vertical, horizontal];
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

export function alignmentAnchorLabel(t: Translate, anchor: AlignmentAnchor): string {
  return t(`ardupilotSetup.osdSetup.anchor.${anchor}`);
}

export function allOsdParamNames(): string[] {
  return [
    ...OSD_GLOBAL_PARAM_NAMES,
    ...OSD_SCREEN_NUMBERS.flatMap((screen) => [...osdScreenControlParamNames(screen), ...osdScreenElementParamNames(screen)]),
  ];
}
