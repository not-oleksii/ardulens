// Real ArduPilot on-board video transmitter (VTX) parameter names, confirmed against
// ArduCopter's own apm.pdef.xml (AP_VideoTX / the "VTX_" parameter group) - this is ArduPilot's
// native VTX control (SmartAudio/Tramp/CRSF/MSP all handled by the firmware itself, exposed as
// plain parameters over MAVLink), the same mechanism every real GCS uses. Not to be confused
// with a standalone microcontroller wired directly to a VTX (e.g. an Arduino
// running its own SmartAudio/Tramp client) - that's a different architecture with no MAVLink
// involvement at all, out of scope for a GCS like this app.
export const VTX_PARAM_NAMES = [
  "VTX_ENABLE",
  "VTX_POWER",
  "VTX_CHANNEL",
  "VTX_BAND",
  "VTX_FREQ",
  "VTX_OPTIONS",
  "VTX_MAX_POWER",
  "VTX_TYPES",
] as const;

export const VTX_ENUM_PARAMS = new Set<string>(["VTX_ENABLE", "VTX_BAND"]);

export const VTX_ENABLE_FALLBACK_VALUES: Record<number, string> = {
  0: "Disable",
  1: "Enable",
};

export const VTX_BAND_FALLBACK_VALUES: Record<number, string> = {
  0: "Band A",
  1: "Band B",
  2: "Band E",
  3: "Airwave",
  4: "RaceBand",
  5: "Low RaceBand",
  6: "1G3 Band A",
  7: "1G3 Band B",
  8: "Band X",
  9: "3G3 Band A",
  10: "3G3 Band B",
};

// VTX_OPTIONS bitmask - "Pitmode" drops the VTX to a low-power state; "Unlocked" allows
// restricted frequencies/power levels some jurisdictions don't permit, so this app never
// pre-checks it and surfaces the same real warning text ArduPilot's own docs carry.
export const VTX_OPTIONS_BITS: { bit: number; labelKey: string }[] = [
  { bit: 0, labelKey: "pitmode" },
  { bit: 1, labelKey: "pitmodeUntilArmed" },
  { bit: 2, labelKey: "pitmodeWhenDisarmed" },
  { bit: 3, labelKey: "unlocked" },
  { bit: 4, labelKey: "leadingZeroByte" },
  { bit: 5, labelKey: "oneStopBit" },
  { bit: 6, labelKey: "ignoreCrc" },
  { bit: 7, labelKey: "ignoreCrsfStatus" },
];

// VTX_TYPES bitmask - which control transport(s) are allowed to own the VTX. AP_VideoTX
// represents a single VTX, so when more than one transport is physically present (e.g. a CRSF
// receiver and an MSP-speaking goggle link both wired up) this selects which one wins.
export const VTX_TYPES_BITS: { bit: number; labelKey: string }[] = [
  { bit: 0, labelKey: "crsf" },
  { bit: 1, labelKey: "smartAudio" },
  { bit: 2, labelKey: "tramp" },
  { bit: 3, labelKey: "msp" },
];
