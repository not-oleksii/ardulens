import { parseDataflash } from "../../parsers/dataflash-bin/dataflash-bin";
import type { DataflashRecord } from "../../parsers/dataflash-bin/types";
import type { RawLogPoint } from "../raw-log/types";
import { buildFlightMapData } from "./flight-map";
import type { FlightMapResult } from "./types";

function extractPoints(records: DataflashRecord[] | undefined, field: string, originUs: number): RawLogPoint[] {
  if (!records) return [];
  const points: RawLogPoint[] = [];
  for (const rec of records) {
    const t = rec["TimeUS"];
    const v = rec[field];
    if (typeof t === "number" && typeof v === "number") points.push({ t: (t - originUs) / 1000, v });
  }
  return points;
}

/**
 * A lean alternative to buildRawLog() + buildFlightMapData() for .bin files: extracts ONLY
 * the POS/GPS message fields the flight map actually needs, instead of building the ~500
 * per-parameter series buildRawLog() produces for GraphsView's arbitrary-parameter
 * charting. For a real ~40MB flight log, that full parse can produce a >300MB object -
 * fine to keep inside the parsing worker, but far too much to transfer back to the UI
 * thread (structured-clone of that size is what was making the map pages appear to hang
 * with nothing ever rendering on large real files).
 */
export function buildFlightMapDataFromBin(_name: string, buf: ArrayBuffer): FlightMapResult {
  const { tables, formats } = parseDataflash(buf);
  if (!Object.keys(formats).length) {
    return { info: "У .bin немає повідомлень із часовою міткою (TimeUS)." };
  }

  const pos = tables["POS"];
  const gps = tables["GPS"];
  if (!pos?.length && !gps?.length) return null;

  let originUs = Infinity;
  for (const rec of [...(pos ?? []), ...(gps ?? [])]) {
    const t = rec["TimeUS"];
    if (typeof t === "number" && t < originUs) originUs = t;
  }
  if (!Number.isFinite(originUs)) return null;

  const series: Record<string, RawLogPoint[]> = {
    "POS.Lat": extractPoints(pos, "Lat", originUs),
    "POS.Lng": extractPoints(pos, "Lng", originUs),
    "POS.RelHomeAlt": extractPoints(pos, "RelHomeAlt", originUs),
    "POS.Alt": extractPoints(pos, "Alt", originUs),
    "GPS.Lat": extractPoints(gps, "Lat", originUs),
    "GPS.Lng": extractPoints(gps, "Lng", originUs),
    "GPS.Alt": extractPoints(gps, "Alt", originUs),
    "GPS.Status": extractPoints(gps, "Status", originUs),
  };

  return buildFlightMapData(series);
}
