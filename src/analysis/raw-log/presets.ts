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
  // Desired-vs-actual rate, the standard PID-tuning diagnostic - RATE is ArduCopter/Sub's
  // rate-controller dataflash message (fields per axis: <Axis>Des, <Axis>). Deep-linked to from
  // PID Tune's per-axis "View in Graphs" button (see PidTuneSection.tsx).
  { key: "pidRoll", candidates: [["RATE.RDes", "RATE.R"]] },
  { key: "pidPitch", candidates: [["RATE.PDes", "RATE.P"]] },
  { key: "pidYaw", candidates: [["RATE.YDes", "RATE.Y"]] },
];

/** Returns the first candidate key-set that's fully present in `series`, or null if none apply. */
export function resolvePreset(preset: Preset, series: Record<string, unknown>): string[] | null {
  for (const candidate of preset.candidates) {
    if (candidate.every((key) => key in series)) return candidate;
  }
  return null;
}
