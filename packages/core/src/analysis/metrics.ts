import { CRASH_TAIL_MS } from "../constants.js";
import { fmtDurMs, fmtKyiv, r0, r1, r2 } from "../format.js";
import { trackStats } from "../geo.js";
import { firstNum, isAirborne, maxOf } from "../samples.js";
import type { Flight, Sample } from "../types.js";

/** Landing voltage = max voltage over the last 10 s (ignores the impact drop on a crash). */
export function landingVoltage(S: Sample[]): number | null {
  const tEnd = S[S.length - 1]!.t;
  let m: number | null = null;
  for (let i = S.length - 1; i >= 0; i--) {
    const s = S[i]!;
    if (s.t < tEnd - CRASH_TAIL_MS) break;
    if (typeof s.voltage === "number" && (m === null || s.voltage > m)) m = s.voltage;
  }
  if (m !== null) return m;
  for (let j = S.length - 1; j >= 0; j--) {
    const v = S[j]!.voltage;
    if (typeof v === "number") return v;
  }
  return null;
}

/** Sag = voltage at the FIRST throttle==100% while airborne, excluding the final crash window. */
export function sagVoltage(S: Sample[]): number | null {
  const tEnd = S.length ? S[S.length - 1]!.t : 0;
  const body = tEnd - S[0]!.t > 60000 ? S.filter((s) => s.t < tEnd - CRASH_TAIL_MS) : S;
  for (const s of body) {
    if (typeof s.throttle === "number" && s.throttle >= 100 && typeof s.voltage === "number" && isAirborne(s)) {
      return s.voltage;
    }
  }
  return null;
}

/** A segment counts as a flight only if it actually got airborne. */
export function isFlightSamples(S: Sample[]): boolean {
  return (maxOf(S, "alt") ?? 0) >= 30 || (maxOf(S, "airspeed") ?? 0) >= 15;
}

export interface Metric {
  h: string;
  fn: (f: Flight) => string;
  manualIfBlank?: boolean;
}

/** Declarative column list: add / reorder a column by editing this array. */
export const METRICS: Metric[] = [
  { h: "Серійний номер борта", fn: (f) => String(f.board) },
  { h: "Напруга при взльоті, В", fn: (f) => r2(firstNum(f.samples, "voltage")) },
  { h: "Напруга при посадці, В", fn: (f) => r2(landingVoltage(f.samples)) },
  { h: "Напруга просадки при газі 100%, В", fn: (f) => r2(sagVoltage(f.samples)) },
  { h: "Максимальна сила струму, А", fn: (f) => r1(maxOf(f.samples, "current")) },
  { h: "Максимальна швидкість (arspd), м/с", fn: (f) => r1(maxOf(f.samples, "airspeed")) },
  {
    h: "Час взльоту (hh:mm)",
    fn: (f) => (f.timeReliable ? fmtKyiv(f.samples[0]!.t) : ""),
    manualIfBlank: true,
  },
  {
    h: "Час посадки (hh:mm)",
    fn: (f) => (f.timeReliable ? fmtKyiv(f.samples[f.samples.length - 1]!.t) : ""),
    manualIfBlank: true,
  },
  {
    h: "Час в повітрі (hh:mm)",
    fn: (f) => fmtDurMs(f.samples[f.samples.length - 1]!.t - f.samples[0]!.t),
  },
  { h: "Максимальна висота, м", fn: (f) => r0(maxOf(f.samples, "alt")) },
  { h: "Максимальна відстань від бази, м", fn: (f) => r0(trackStats(f).maxd) },
  {
    h: "Пройдений шлях, км",
    fn: (f) => {
      const p = trackStats(f).path;
      return p == null ? "" : r1(p);
    },
  },
];

export const COLUMNS: string[] = METRICS.map((m) => m.h);

export interface ComputedRow {
  row: string[];
  ground: boolean;
  manualCols: number[];
}

export function computeRow(flight: Flight): ComputedRow {
  const alt = maxOf(flight.samples, "alt");
  return {
    row: METRICS.map((m) => m.fn(flight)),
    ground: alt == null || alt < 30,
    manualCols: METRICS.map((m, i) => (m.manualIfBlank && !flight.timeReliable ? i : -1)).filter(
      (i) => i >= 0,
    ),
  };
}
