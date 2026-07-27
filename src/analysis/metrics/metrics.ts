import { CRASH_TAIL_MS } from "../../constants";
import { fmtDurMs, fmtKyiv, r0, r1, r2 } from "../../utils/format/format";
import { trackStats } from "../../utils/geo/geo";
import { avgOf, firstNum, isAirborne, maxOf } from "../../utils/samples/samples";
import type { Flight, Sample } from "../../types";
import type { ComputedRow, Metric } from "./types";

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

/** Sag drop expressed as a percentage of the takeoff voltage instead of an absolute value. */
export function sagVoltagePercent(S: Sample[]): number | null {
  const takeoff = firstNum(S, "voltage");
  const sag = sagVoltage(S);
  if (takeoff === null || sag === null || takeoff <= 0) return null;
  return ((takeoff - sag) / takeoff) * 100;
}

/** Consumed capacity (mAh), trapezoidal-integrating current (A) over elapsed time. An estimate, not a coulomb count. */
export function estimatedCapacityMah(S: Sample[]): number | null {
  let mah = 0;
  let integrated = false;
  for (let i = 1; i < S.length; i++) {
    const prev = S[i - 1]!;
    const cur = S[i]!;
    if (typeof prev.current === "number" && typeof cur.current === "number") {
      const avgCurrent = (prev.current + cur.current) / 2;
      const dtHours = (cur.t - prev.t) / 3_600_000;
      mah += avgCurrent * dtHours * 1000;
      integrated = true;
    }
  }
  return integrated ? mah : null;
}

/** Number of times the flight mode changed between consecutive samples that report one. */
export function modeChangeCount(S: Sample[]): number {
  let count = 0;
  let prevMode: number | undefined;
  for (const s of S) {
    if (typeof s.mode === "number") {
      if (prevMode !== undefined && s.mode !== prevMode) count++;
      prevMode = s.mode;
    }
  }
  return count;
}

/** A segment counts as a flight only if it actually got airborne. */
export function isFlightSamples(S: Sample[]): boolean {
  return (maxOf(S, "alt") ?? 0) >= 30 || (maxOf(S, "airspeed") ?? 0) >= 15;
}

/** Declarative column list: add / reorder a column by editing this array. */
export const METRICS: Metric[] = [
  { h: "Серійний номер борта", key: "board", fn: (f) => String(f.board) },
  { h: "Напруга при взльоті, В", key: "takeoffVoltage", fn: (f) => r2(firstNum(f.samples, "voltage")) },
  { h: "Напруга при посадці, В", key: "landingVoltage", fn: (f) => r2(landingVoltage(f.samples)) },
  {
    h: "Напруга просадки при газі 100%, В",
    key: "sagVoltage",
    fn: (f) => r2(sagVoltage(f.samples)),
  },
  { h: "Максимальна сила струму, А", key: "maxCurrent", fn: (f) => r1(maxOf(f.samples, "current")) },
  {
    h: "Максимальна швидкість (arspd), м/с",
    key: "maxAirspeed",
    fn: (f) => r1(maxOf(f.samples, "airspeed")),
  },
  {
    h: "Час взльоту (hh:mm)",
    key: "takeoffTime",
    fn: (f) => (f.timeReliable ? fmtKyiv(f.samples[0]!.t) : ""),
    manualIfBlank: true,
  },
  {
    h: "Час посадки (hh:mm)",
    key: "landingTime",
    fn: (f) => (f.timeReliable ? fmtKyiv(f.samples[f.samples.length - 1]!.t) : ""),
    manualIfBlank: true,
  },
  {
    h: "Час в повітрі (hh:mm)",
    key: "flightDuration",
    fn: (f) => fmtDurMs(f.samples[f.samples.length - 1]!.t - f.samples[0]!.t),
  },
  { h: "Максимальна висота, м", key: "maxAltitude", fn: (f) => r0(maxOf(f.samples, "alt")) },
  {
    h: "Максимальна відстань від бази, м",
    key: "maxDistance",
    fn: (f) => r0(trackStats(f).maxd),
    approximate: true,
  },
  {
    h: "Пройдений шлях, км",
    key: "pathTraveled",
    fn: (f) => {
      const p = trackStats(f).path;
      return p == null ? "" : r1(p);
    },
    approximate: true,
  },
  {
    h: "Просадка напруги, %",
    key: "sagPercent",
    fn: (f) => r1(sagVoltagePercent(f.samples)),
    defaultVisible: false,
  },
  {
    h: "Середня сила струму, А",
    key: "avgCurrent",
    fn: (f) => r1(avgOf(f.samples, "current")),
    defaultVisible: false,
  },
  {
    h: "Оцінка витраченої ємності, мАг",
    key: "estimatedCapacityUsed",
    fn: (f) => r0(estimatedCapacityMah(f.samples)),
    approximate: true,
    defaultVisible: false,
  },
  {
    h: "Кількість перемикань режиму польоту",
    key: "modeChanges",
    fn: (f) => r0(modeChangeCount(f.samples)),
    defaultVisible: false,
  },
];

export const COLUMNS: string[] = METRICS.map((m) => m.h);

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
