import { MAX_FROM_CENTER, MAX_STEP_SPEED } from "../../constants";
import { haversine, median } from "../../utils/geo/geo";
import type { RawLogPoint } from "../raw-log/types";
import type { FlightMapData, GpsLossRegion, TrackPoint } from "./types";

const MIN_SAMPLE_GAP_MS = 1000; // downsample to ~1Hz, matching cleanTrack()

function isValidLatLon(lat: number, lon: number): boolean {
  return Math.abs(lat) > 1e-4 || Math.abs(lon) > 1e-4;
}

/** Zips separate Lat/Lon/Alt series (sharing the same TimeUS origin) into track points. */
function zipTrack(latSeries?: RawLogPoint[], lonSeries?: RawLogPoint[], altSeries?: RawLogPoint[]): TrackPoint[] {
  if (!latSeries || !lonSeries) return [];
  const lonByT = new Map(lonSeries.map((p) => [p.t, p.v]));
  const altByT = new Map((altSeries ?? []).map((p) => [p.t, p.v]));

  const out: TrackPoint[] = [];
  for (const latP of latSeries) {
    const lon = lonByT.get(latP.t);
    if (lon === undefined || !isValidLatLon(latP.v, lon)) continue;
    out.push({ t: latP.t, lat: latP.v, lon, alt: altByT.get(latP.t) ?? null });
  }
  return out.sort((a, b) => a.t - b.t);
}

function downsample(points: TrackPoint[]): TrackPoint[] {
  const out: TrackPoint[] = [];
  let lastT: number | null = null;
  for (const p of points) {
    if (lastT === null || p.t - lastT >= MIN_SAMPLE_GAP_MS) {
      out.push(p);
      lastT = p.t;
    }
  }
  return out;
}

/**
 * Downsamples to ~1Hz and classifies each point as kept or rejected using the same
 * median-center + max-step-speed teleport rejection as cleanTrack() (utils/geo/geo.ts),
 * but keeps every point (tagged) instead of only the survivors - the flight map needs to
 * show WHERE the rejected/spoofed regions are, not just how many points were dropped.
 */
function classifyTrack(points: TrackPoint[]): { kept: TrackPoint[]; rejected: TrackPoint[] } {
  const ds = downsample(points);
  if (!ds.length) return { kept: [], rejected: [] };

  const centerLat = median(ds.map((p) => p.lat));
  const centerLon = median(ds.map((p) => p.lon));

  const kept: TrackPoint[] = [];
  const rejected: TrackPoint[] = [];
  for (const p of ds) {
    if (haversine(centerLat, centerLon, p.lat, p.lon) > MAX_FROM_CENTER) {
      rejected.push(p);
      continue;
    }
    const prev = kept[kept.length - 1];
    if (prev) {
      const dtSec = Math.abs(p.t - prev.t) / 1000;
      const dist = haversine(prev.lat, prev.lon, p.lat, p.lon);
      if (dtSec > 0 && dist / dtSec > MAX_STEP_SPEED) {
        rejected.push(p);
        continue;
      }
    }
    kept.push(p);
  }
  return { kept, rejected };
}

/** Finds the GCS/fused track point with the timestamp closest to `t`. */
function nearestGcsPoint(gcsTrack: TrackPoint[], t: number): TrackPoint | null {
  if (!gcsTrack.length) return null;
  let best = gcsTrack[0]!;
  let bestDiff = Math.abs(best.t - t);
  for (const p of gcsTrack) {
    const diff = Math.abs(p.t - t);
    if (diff < bestDiff) {
      best = p;
      bestDiff = diff;
    }
  }
  return best;
}

function groupIntoRegions(rejected: TrackPoint[], allSorted: TrackPoint[], gcsTrack: TrackPoint[]): GpsLossRegion[] {
  if (!rejected.length) return [];
  const rejectedTimes = new Set(rejected.map((p) => p.t));

  const spans: TrackPoint[][] = [];
  let current: TrackPoint[] | null = null;
  for (const p of allSorted) {
    if (rejectedTimes.has(p.t)) {
      (current ??= []).push(p);
    } else if (current) {
      spans.push(current);
      current = null;
    }
  }
  if (current) spans.push(current);

  return spans.map((span) => {
    const startMs = span[0]!.t;
    const endMs = span[span.length - 1]!.t;
    // Prefer the fused/GCS position for the marker; if there's no POS data at all, fall
    // back to the raw point's own altitude (its lat/lon during the loss is untrustworthy,
    // but altitude often isn't spoofed the same way horizontal position is).
    const anchor = nearestGcsPoint(gcsTrack, (startMs + endMs) / 2);
    return {
      startMs,
      endMs,
      lat: anchor?.lat ?? null,
      lon: anchor?.lon ?? null,
      alt: anchor?.alt ?? span[0]!.alt,
    };
  });
}

/**
 * Builds the flight-map's track layers from a RawLog's per-message series: the fused/GCS
 * position (POS), the raw GPS position, a teleport-rejected "cleaned" GPS track, and the
 * time ranges where raw GPS was rejected (GPS loss / spoofing regions).
 */
export function buildFlightMapData(series: Record<string, RawLogPoint[]>): FlightMapData | null {
  const gcsTrack = zipTrack(series["POS.Lat"], series["POS.Lng"], series["POS.RelHomeAlt"] ?? series["POS.Alt"]);
  const rawGpsTrack = zipTrack(series["GPS.Lat"], series["GPS.Lng"], series["GPS.Alt"]);

  if (!gcsTrack.length && !rawGpsTrack.length) return null;

  const gpsTrack = downsample(rawGpsTrack);
  const { kept, rejected } = classifyTrack(rawGpsTrack);

  return {
    gcsTrack,
    gpsTrack,
    cleanedTrack: kept,
    gpsLossRegions: groupIntoRegions(rejected, gpsTrack, gcsTrack),
  };
}
