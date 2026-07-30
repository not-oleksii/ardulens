import { PLANE_MODE_NAMES } from "../../constants";
import { parseDataflash } from "../../parsers/dataflash-bin/dataflash-bin";
import { parseSkylog } from "../../parsers/skylog/skylog";
import { isParsedError, isParsedInfo, isParsedFlights, type Sample } from "../../types";
import type { ModeSegment, ParamCategory, RawLogPoint, RawLogResult } from "./types";

/** Message types that describe the log itself (formats, units, parameters) rather than flight data. */
const EXCLUDED_MESSAGES = new Set(["FMT", "FMTU", "UNIT", "MULT", "MSG", "PARM", "MODE"]);
const STRING_FIELD_CHARS = new Set(["n", "N", "Z", "M"]);

const MESSAGE_CATEGORY: Record<string, string> = {
  ATT: "attitude",
  AHRS2: "attitude",
  AHR2: "attitude",
  IMU: "sensors",
  IMU2: "sensors",
  IMU3: "sensors",
  BARO: "sensors",
  MAG: "sensors",
  MAG2: "sensors",
  ARSP: "sensors",
  GPS: "sensors",
  GPS2: "sensors",
  VIBE: "sensors",
  RCIN: "rc",
  RCOU: "servos",
  CTUN: "servos",
  BAT: "power",
  BAT2: "power",
  CURR: "power",
  POWR: "board",
  MCU: "board",
};
const CATEGORY_ORDER = ["attitude", "sensors", "servos", "rc", "power", "board", "telemetry", "other"];

function isBinFile(name: string, u8: Uint8Array): boolean {
  return /\.bin$/i.test(name) || (u8.length > 2 && u8[0] === 0xa3 && u8[1] === 0x95);
}

function sortCategories(categories: ParamCategory[]): ParamCategory[] {
  return categories
    .filter((c) => c.params.length > 0)
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.key) - CATEGORY_ORDER.indexOf(b.key));
}

function buildModeSegments(modeRecords: Array<{ t: number; mode: number }>, endMs: number): ModeSegment[] {
  const sorted = modeRecords.slice().sort((a, b) => a.t - b.t);
  // A message can log the mode repeatedly even when it hasn't changed - collapse
  // consecutive duplicates so each segment represents one contiguous mode span.
  const changes = sorted.filter((rec, i) => i === 0 || rec.mode !== sorted[i - 1]!.mode);
  return changes.map((rec, i) => ({
    startMs: rec.t,
    endMs: i + 1 < changes.length ? changes[i + 1]!.t : endMs,
    mode: rec.mode,
    label: PLANE_MODE_NAMES[rec.mode] ?? `Mode ${rec.mode}`,
  }));
}

function buildRawLogFromBin(buf: ArrayBuffer): RawLogResult {
  const { tables, formats } = parseDataflash(buf);

  let originUs: number | null = null;
  let maxUs: number | null = null;
  for (const name in tables) {
    for (const rec of tables[name]!) {
      const t = rec["TimeUS"];
      if (typeof t !== "number") continue;
      if (originUs === null || t < originUs) originUs = t;
      if (maxUs === null || t > maxUs) maxUs = t;
    }
  }
  if (originUs === null || maxUs === null) return { info: "У .bin немає повідомлень із часовою міткою (TimeUS)." };

  const categoriesByKey = new Map<string, ParamCategory>();
  const series: Record<string, RawLogPoint[]> = {};

  for (const name in tables) {
    if (EXCLUDED_MESSAGES.has(name)) continue;
    const records = tables[name]!;
    const def = formats[name];
    if (!records.length || !def) continue;

    const timeIdx = def.labels.indexOf("TimeUS");
    if (timeIdx < 0) continue;

    const categoryKey = MESSAGE_CATEGORY[name] ?? "other";
    const category = categoriesByKey.get(categoryKey) ?? { key: categoryKey, params: [] };
    categoriesByKey.set(categoryKey, category);

    def.labels.forEach((label, fieldIdx) => {
      if (label === "TimeUS" || STRING_FIELD_CHARS.has(def.fmt[fieldIdx]!)) return;

      const key = `${name}.${label}`;
      const points: RawLogPoint[] = [];
      for (const rec of records) {
        const t = rec["TimeUS"];
        const v = rec[label];
        if (typeof t === "number" && typeof v === "number") points.push({ t: (t - originUs) / 1000, v });
      }
      if (!points.length) return;

      points.sort((a, b) => a.t - b.t);
      series[key] = points;
      category.params.push({ key, label: key });
    });
  }

  const modeRecords = (tables["MODE"] ?? [])
    .map((rec) => ({
      t: ((rec["TimeUS"] as number) - originUs) / 1000,
      mode: (rec["ModeNum"] ?? rec["Mode"]) as number,
    }))
    .filter((r) => typeof r.mode === "number");

  return {
    fmt: "bin",
    timeRangeMs: [0, (maxUs - originUs) / 1000],
    modeSegments: buildModeSegments(modeRecords, (maxUs - originUs) / 1000),
    categories: sortCategories(Array.from(categoriesByKey.values())),
    series,
  };
}

const TELEMETRY_FIELDS: Array<{ key: keyof Sample; label: string }> = [
  { key: "voltage", label: "voltage" },
  { key: "current", label: "current" },
  { key: "airspeed", label: "airspeed" },
  { key: "throttle", label: "throttle" },
  { key: "alt", label: "alt" },
];

function buildRawLogFromSkylog(buf: ArrayBuffer): RawLogResult {
  const result = parseSkylog(buf);
  if (isParsedError(result)) return { error: result.error };
  if (isParsedInfo(result)) return { info: result.info };
  if (!isParsedFlights(result) || !result.flights.length) return { info: "У .skylog немає вильоту." };

  // Multiple flights/boards can share one file - graph only the largest one.
  const flight = result.flights.reduce((best, f) => (f.samples.length > best.samples.length ? f : best));
  const originMs = flight.samples[0]!.t;
  const maxMs = flight.samples[flight.samples.length - 1]!.t;

  const series: Record<string, RawLogPoint[]> = {};
  const params = TELEMETRY_FIELDS.filter(({ key }) => flight.samples.some((s) => typeof s[key] === "number")).map(
    ({ key, label }) => {
      const seriesKey = `telemetry.${label}`;
      series[seriesKey] = flight.samples
        .filter((s) => typeof s[key] === "number")
        .map((s) => ({ t: s.t - originMs, v: s[key] as number }));
      return { key: seriesKey, label: seriesKey };
    },
  );

  const modeRecords = flight.samples
    .filter((s) => typeof s.mode === "number")
    .map((s) => ({ t: s.t - originMs, mode: s.mode as number }));

  return {
    fmt: "skylog",
    timeRangeMs: [0, maxMs - originMs],
    modeSegments: buildModeSegments(modeRecords, maxMs - originMs),
    categories: sortCategories([{ key: "telemetry", params }]),
    series,
  };
}

export function buildRawLog(name: string, buf: ArrayBuffer): RawLogResult {
  const u8 = new Uint8Array(buf);
  return isBinFile(name, u8) ? buildRawLogFromBin(buf) : buildRawLogFromSkylog(buf);
}

export type { ModeSegment, ParamCategory, ParamDef, RawLog, RawLogPoint, RawLogResult } from "./types";
export { isRawLog, isRawLogError, isRawLogInfo } from "./types";
