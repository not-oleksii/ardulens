import { isFlightSamples } from "../../analysis/metrics/metrics";
import type { ParseResult, Sample } from "../../types";
import type { DataflashRecord, DataflashTables, FormatDef } from "./types";

function readStr(dv: DataView, off: number, len: number): string {
  let s = "";
  for (let k = 0; k < len; k++) {
    const b = dv.getUint8(off + k);
    if (b === 0) break;
    s += String.fromCharCode(b);
  }
  return s;
}

/** Read one field by ArduPilot format char; returns [value, byteSize]. */
function readField(dv: DataView, off: number, ch: string): [number | string, number] {
  switch (ch) {
    case "b": return [dv.getInt8(off), 1];
    case "B": case "M": return [dv.getUint8(off), 1];
    case "h": return [dv.getInt16(off, true), 2];
    case "H": return [dv.getUint16(off, true), 2];
    case "i": return [dv.getInt32(off, true), 4];
    case "I": return [dv.getUint32(off, true), 4];
    case "f": return [dv.getFloat32(off, true), 4];
    case "d": return [dv.getFloat64(off, true), 8];
    case "c": return [dv.getInt16(off, true) * 0.01, 2];
    case "C": return [dv.getUint16(off, true) * 0.01, 2];
    case "e": return [dv.getInt32(off, true) * 0.01, 4];
    case "E": return [dv.getUint32(off, true) * 0.01, 4];
    case "L": return [dv.getInt32(off, true) * 1e-7, 4];
    case "q": return [Number(dv.getBigInt64(off, true)), 8];
    case "Q": return [Number(dv.getBigUint64(off, true)), 8];
    case "n": return [readStr(dv, off, 4), 4];
    case "N": return [readStr(dv, off, 16), 16];
    case "Z": return [readStr(dv, off, 64), 64];
    default: return [0, 1];
  }
}

const WANTED_MESSAGES = new Set(["GPS", "BAT", "CTUN", "ARSP", "ARM", "MODE", "POS", "STAT", "PARM"]);

/** Self-describing DataFlash: FMT messages (type 128) define every other message. */
export function parseDataflash(buf: ArrayBuffer): DataflashTables {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const n = u8.length;
  const formats: Record<number, FormatDef> = {};
  const out: DataflashTables = {};
  let p = 0;

  while (p + 3 <= n) {
    if (u8[p] !== 0xa3 || u8[p + 1] !== 0x95) { p++; continue; } // resync to header
    const type = u8[p + 2]!;

    if (type === 128) { // FMT: B B n(4) N(16) Z(64)
      if (p + 89 > n) break; // truncated FMT record -> stop rather than read past the buffer
      const t = dv.getUint8(p + 3);
      const len = dv.getUint8(p + 4);
      const name = readStr(dv, p + 5, 4);
      const fmt = readStr(dv, p + 9, 16);
      const labels = readStr(dv, p + 25, 64).split(",");
      formats[t] = { name, fmt, labels, len };
      p += 89;
      continue;
    }

    const d = formats[type];
    if (!d) { p++; continue; }
    const size = d.len - 3;
    if (p + 3 + size > n) break;

    if (WANTED_MESSAGES.has(d.name)) {
      let off = p + 3;
      const rec: DataflashRecord = {};
      for (let k = 0; k < d.fmt.length; k++) {
        const [value, byteSize] = readField(dv, off, d.fmt[k]!);
        rec[d.labels[k]!] = value;
        off += byteSize;
      }
      (out[d.name] ??= []).push(rec);
    }
    p += 3 + size;
  }
  return out;
}

/** Under spoofing there can be two GPS units; the real one has the most stable latitude. */
function realGpsInstance(GPS: DataflashRecord[]): DataflashRecord[] {
  const byI: Record<string, DataflashRecord[]> = {};
  GPS.forEach((g) => {
    const key = String(g["I"]);
    (byI[key] ??= []).push(g);
  });

  let best: string | null = null;
  let bestSd = Infinity;
  for (const i in byI) {
    const lats = byI[i]!.filter((g) => Math.abs(g["Lat"] as number) > 1).map((g) => g["Lat"] as number);
    if (lats.length < 3) continue;
    const m = lats.reduce((a, b) => a + b, 0) / lats.length;
    const sd = Math.sqrt(lats.reduce((a, b) => a + (b - m) * (b - m), 0) / lats.length);
    if (sd < bestSd) { bestSd = sd; best = i; }
  }
  return (best !== null ? byI[best]! : []).filter((g) => Math.abs(g["Lat"] as number) > 1);
}

/** Flight windows: ARM(1->0) pairs, or the STAT.Armed span if ARM pairs are missing. */
function binWindows(m: DataflashTables): Array<[number, number]> {
  const ARM = (m["ARM"] ?? []).slice().sort((a, b) => (a["TimeUS"] as number) - (b["TimeUS"] as number));

  const segs: Array<[number, number]> = [];
  let start: number | null = null;
  ARM.forEach((a) => {
    if (a["ArmState"] === 1 && start === null) start = a["TimeUS"] as number;
    else if (a["ArmState"] === 0 && start !== null) { segs.push([start, a["TimeUS"] as number]); start = null; }
  });

  let full = segs.filter((s) => s[1] - s[0] > 60e6);
  if (full.length > 1) { // merge short re-arm gaps (<30 s)
    const mg: Array<[number, number]> = [full[0]!];
    for (let i = 1; i < full.length; i++) {
      const last = mg[mg.length - 1]!;
      if (full[i]![0] - last[1] < 30e6) mg[mg.length - 1] = [last[0], full[i]![1]];
      else mg.push(full[i]!);
    }
    full = mg;
  }
  if (full.length) return full;

  // Fallback: log started already armed -> use STAT.Armed span.
  const STAT = m["STAT"] ?? [];
  let lo: number | null = null;
  let hi: number | null = null;
  for (const s of STAT) {
    if (s["Armed"] === 1) {
      const t = s["TimeUS"] as number;
      if (lo === null || t < lo) lo = t;
      if (hi === null || t > hi) hi = t;
    }
  }
  if (lo !== null && hi !== null && hi - lo > 60e6) return [[lo, hi]];
  return [];
}

interface TimedValue {
  t: number;
  v: number | undefined;
}

/** Join per-field streams into unified samples at 100 ms (sample-and-hold). */
function holdMerge(s: number, e: number, streams: Record<string, TimedValue[]>): Sample[] {
  const ptr: Record<string, number> = {};
  for (const k in streams) ptr[k] = 0;

  const samples: Sample[] = [];
  for (let t = s; t <= e; t += 100_000) { // step 100 ms (in microseconds)
    const smp: Record<string, number> = { t: t / 1000 };
    for (const kk in streams) {
      const arr = streams[kk]!;
      while (ptr[kk]! + 1 < arr.length && arr[ptr[kk]! + 1]!.t <= t) ptr[kk]!++;
      const cur = arr[ptr[kk]!];
      if (cur && cur.t <= t && cur.v !== undefined) smp[kk] = cur.v;
    }
    samples.push(smp as unknown as Sample);
  }
  return samples;
}

export function parseBin(buf: ArrayBuffer, board?: string): ParseResult {
  const m = parseDataflash(buf);
  const wins = binWindows(m);
  if (!wins.length) return { info: "У .bin не вдалося визначити виліт (немає ані пари ARM, ані STAT.Armed)." };

  const BAT = m["BAT"] ?? [];
  const CTUN = m["CTUN"] ?? [];
  const ARSP = m["ARSP"] ?? [];
  const MODE = (m["MODE"] ?? []).slice().sort((a, b) => (a["TimeUS"] as number) - (b["TimeUS"] as number));

  // Position/altitude from POS (fused, spoof-resistant); fall back to the real GPS unit.
  const POS = (m["POS"] ?? []).filter((p) => Math.abs(p["Lat"] as number) > 1);
  const usePos = POS.length > 0;
  const track = usePos ? POS : realGpsInstance(m["GPS"] ?? []);
  const bd = board || "?";

  const mk = (arr: DataflashRecord[], vk: string): TimedValue[] =>
    arr.map((x) => ({ t: x["TimeUS"] as number, v: x[vk] as number | undefined }));

  const flights = wins
    .map(([s, e]) => {
      const streams: Record<string, TimedValue[]> = {
        voltage: mk(BAT, "Volt"),
        current: mk(BAT, "Curr"),
        airspeed: mk(ARSP, "Airspeed"),
        throttle: mk(CTUN, "ThO"),
        mode: MODE.map((x) => ({ t: x["TimeUS"] as number, v: x["ModeNum"] as number | undefined })),
        alt: track.map((x) => ({
          t: x["TimeUS"] as number,
          v: (usePos ? x["RelHomeAlt"] : x["Alt"]) as number | undefined,
        })),
        lat: track.map((x) => ({ t: x["TimeUS"] as number, v: x["Lat"] as number | undefined })),
        lon: track.map((x) => ({ t: x["TimeUS"] as number, v: x["Lng"] as number | undefined })),
      };
      for (const k in streams) streams[k]!.sort((a, b) => a.t - b.t);

      const samples = holdMerge(s, e, streams);

      // GPS fallback gives AMSL altitude -> make it relative to the takeoff point.
      if (!usePos) {
        let base: number | null = null;
        for (const smp of samples) if (typeof smp.alt === "number") { base = smp.alt; break; }
        if (base === null) base = 0;
        for (const smp of samples) if (typeof smp.alt === "number") smp.alt -= base;
      }

      return { board: bd, timeReliable: false, fmt: "bin" as const, samples };
    })
    .filter((f) => isFlightSamples(f.samples));

  if (!flights.length) return { info: "У .bin немає вильоту (борт не піднявся в повітря)." };
  return { flights, boards: [bd], fmt: "bin" };
}
