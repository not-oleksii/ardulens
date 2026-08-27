import type { DeviceKind, DevicePattern } from "./types";

export interface DevicePreset {
  id: string;
  kind: DeviceKind;
  pattern: DevicePattern;
  rangeM: number;
  beamwidthDeg: number;
  /** i18n key for the preset's display name - kept as a key (not a literal string) since this
   *  data is shared by every locale, resolved by the UI layer via t(). */
  labelKey: string;
}

/** Built-in beacon/antenna presets - a starting point for a newly-placed device's range/pattern/
 *  beamwidth, not a fixed catalog: every field stays editable afterward in the property panel
 *  (which clears `presetId` back to null once anything is hand-tuned). Real-world figures are
 *  rough orders of magnitude for planning purposes, not manufacturer specs. */
export const DEVICE_PRESETS: DevicePreset[] = [
  { id: "beacon-standard", kind: "beacon", pattern: "omni", rangeM: 300, beamwidthDeg: 360, labelKey: "groundStation.devices.presets.beaconStandard" },
  { id: "antenna-omni", kind: "antenna", pattern: "omni", rangeM: 2000, beamwidthDeg: 360, labelKey: "groundStation.devices.presets.antennaOmni" },
  { id: "antenna-dipole", kind: "antenna", pattern: "dipole", rangeM: 3000, beamwidthDeg: 360, labelKey: "groundStation.devices.presets.antennaDipole" },
  {
    id: "antenna-directional",
    kind: "antenna",
    pattern: "directional",
    rangeM: 8000,
    beamwidthDeg: 30,
    labelKey: "groundStation.devices.presets.antennaDirectional",
  },
];

export function defaultPresetFor(kind: DeviceKind): DevicePreset {
  return DEVICE_PRESETS.find((p) => p.kind === kind) ?? DEVICE_PRESETS[0]!;
}

export function presetsFor(kind: DeviceKind): DevicePreset[] {
  return DEVICE_PRESETS.filter((p) => p.kind === kind);
}
