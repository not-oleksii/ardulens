export interface Preset {
  /** i18n key under graphs.presets.<key>. */
  key: string;
  /** Alternative key-sets (e.g. .bin vs .skylog field names) - the first fully available one is used. */
  candidates: string[][];
}

export const PRESETS: Preset[] = [
  { key: "battery", candidates: [["BAT.Volt", "BAT.Curr"], ["telemetry.voltage", "telemetry.current"]] },
  { key: "airspeed", candidates: [["ARSP.Airspeed"], ["telemetry.airspeed"]] },
  { key: "attitude", candidates: [["ATT.Roll", "ATT.Pitch", "ATT.Yaw"]] },
  { key: "rcInputs", candidates: [["RCIN.C1", "RCIN.C2", "RCIN.C3", "RCIN.C4"]] },
  { key: "throttle", candidates: [["CTUN.ThO"], ["telemetry.throttle"]] },
];

/** Returns the first candidate key-set that's fully present in `series`, or null if none apply. */
export function resolvePreset(preset: Preset, series: Record<string, unknown>): string[] | null {
  for (const candidate of preset.candidates) {
    if (candidate.every((key) => key in series)) return candidate;
  }
  return null;
}
