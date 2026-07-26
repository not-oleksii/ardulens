import { isFlightSamples } from "../../analysis/metrics/metrics";
import type { ParseResult, Sample } from "../../types";

const TLM_RE = /\{telemetry:"([^"]*)"\}/;
const SETID_RE = /\{setid:(\d+)/;
const IDM_RE = /\{id:(\d+)/;
const ENVID_RE = /\{env:\{[^}]*\bid:(\d+)/;

type RawValue = string | number | null;
type RawRecord = Record<string, RawValue> & { time: number; _board: number | null; armed?: RawValue };

function coerce(v: string): RawValue {
  v = v.trim();
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  const f = parseFloat(v);
  return isNaN(f) ? v : f;
}

function parseKV(inner: string): Record<string, RawValue> {
  const o: Record<string, RawValue> = {};
  inner.split(",").forEach((p) => {
    const i = p.indexOf(":");
    if (i < 0) return;
    o[p.slice(0, i).trim()] = coerce(p.slice(i + 1));
  });
  return o;
}

/** Prefer inertial lat/lon (spoofing-resistant); fall back to raw GPS. */
function skBest(r: Record<string, RawValue>): [number | null, number | null] {
  const lat = r["lat"];
  const lon = r["lon"];
  if (typeof lat === "number" && Math.abs(lat) > 1e-4 && typeof lon === "number" && Math.abs(lon) > 1e-4) {
    return [lat, lon];
  }
  const gpsLat = r["gps_lat"];
  const gpsLon = r["gps_lon"];
  if (
    typeof gpsLat === "number" &&
    Math.abs(gpsLat) > 1e-4 &&
    typeof gpsLon === "number" &&
    Math.abs(gpsLon) > 1e-4
  ) {
    return [gpsLat, gpsLon];
  }
  return [null, null];
}

/** Most frequent board id inside a segment. */
function boardOf(seg: RawRecord[]): string {
  const c: Record<string, number> = {};
  for (const r of seg) c[String(r._board)] = (c[String(r._board)] ?? 0) + 1;
  let best: string | null = null;
  let bn = -1;
  for (const k in c) if (c[k]! > bn) { bn = c[k]!; best = k; }
  return best ?? "?";
}

export function parseSkylog(buf: ArrayBuffer): ParseResult {
  const text = new TextDecoder("utf-8").decode(buf);

  if (text.indexOf("{telemetry:") < 0) {
    return {
      error:
        text.indexOf("{tlm:") >= 0
          ? "Цей skylog записаний БЕЗ -extended_log (лише сирий {tlm:...}). Скористайтесь .bin цього борта."
          : "У файлі немає розшифрованої телеметрії {telemetry:...}.",
    };
  }

  // The active board id switches via setid/id/env(id); telemetry after a switch
  // belongs to that board -> tag every record.
  let cur: number | null = null;
  const recs: RawRecord[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const mi = SETID_RE.exec(line) ?? IDM_RE.exec(line) ?? ENVID_RE.exec(line);
    if (mi) cur = parseInt(mi[1]!, 10);
    if (line.indexOf("telemetry") < 0) continue;
    const m = TLM_RE.exec(line);
    if (!m) continue;
    const o = parseKV(m[1]!);
    if ("time" in o) recs.push({ ...o, time: o["time"] as number, _board: cur });
  }

  const seen = new Set<string>();
  recs.sort((a, b) => a.time - b.time);
  const uniq = recs.filter((r) => {
    const k = `${r.time}/${r._board}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Split into armed segments, breaking on a board change.
  const segs: RawRecord[][] = [];
  let c: RawRecord[] = [];
  for (const r of uniq) {
    if (Number(r.armed) === 1) {
      if (c.length && c[c.length - 1]!._board !== r._board) {
        if (c.length >= 2) segs.push(c);
        c = [];
      }
      c.push(r);
    } else {
      if (c.length >= 2) segs.push(c);
      c = [];
    }
  }
  if (c.length >= 2) segs.push(c);

  // Merge same-board segments split by a short disarm (<30 s) - re-arm glitches.
  const mg: RawRecord[][] = segs.length ? [segs[0]!] : [];
  for (let j = 1; j < segs.length; j++) {
    const s = segs[j]!;
    const last = mg[mg.length - 1]!;
    if (boardOf(s) === boardOf(last) && s[0]!.time - last[last.length - 1]!.time < 30000) {
      mg[mg.length - 1] = last.concat(s);
    } else {
      mg.push(s);
    }
  }

  const flights = mg
    .map((seg) => {
      const samples: Sample[] = seg.map((r) => {
        const [lat, lon] = skBest(r);
        return {
          t: r.time,
          voltage: typeof r["voltage"] === "number" ? r["voltage"] : undefined,
          current: typeof r["current"] === "number" ? r["current"] : undefined,
          airspeed: typeof r["airspeed"] === "number" ? r["airspeed"] : undefined,
          throttle: typeof r["throttle"] === "number" ? r["throttle"] : undefined,
          alt: typeof r["alt"] === "number" ? r["alt"] : undefined,
          lat: lat ?? undefined,
          lon: lon ?? undefined,
          mode: typeof r["mode"] === "number" ? r["mode"] : undefined,
        };
      });
      return { board: boardOf(seg), timeReliable: true, fmt: "skylog" as const, samples };
    })
    .filter((f) => isFlightSamples(f.samples));

  const boards = new Set<string>();
  flights.forEach((f) => boards.add(f.board));
  return { flights, boards: Array.from(boards), fmt: "skylog" };
}
