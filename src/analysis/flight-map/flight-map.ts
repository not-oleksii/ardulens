import { MAX_FROM_CENTER, MAX_STEP_SPEED, MIN_USABLE_GPS_STATUS } from "../../constants";
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
 * Downsamples to ~1Hz and classifies each point as kept or rejected using the GPS
 * receiver's own reported fix status (when available), plus max-step-speed teleport
 * rejection (same as cleanTrack(), utils/geo/geo.ts) - but keeps every point (tagged)
 * instead of only the survivors, since the flight map needs to show WHERE the
 * rejected/spoofed regions are, not just how many points were dropped.
 *
 * A GPS.Status below MIN_USABLE_GPS_STATUS rejects a point outright, regardless of how
 * plausible its position looks - the receiver itself is reporting no usable fix, which a
 * pure position-based check can't see (a lost-fix sample may just hold a stale-but-
 * plausible position rather than an obvious jump). statusByT is keyed by the point's own
 * timestamp (shares the same TimeUS origin as the position fields, so exact lookup - not
 * nearest-match - is correct here); absent when the caller has no GPS.Status series at
 * all, in which case classification falls through to the position-based checks alone.
 *
 * Distance-from-truth is anchored to the trusted fused/GCS (POS/EKF) position at each
 * point's own moment when available, NOT a median of the raw GPS stream itself: a median
 * is only robust while spoofed points are a minority. Tested against a real ~25-minute
 * flight with heavy GPS spoofing (raw GPS teleporting across entire continents), a
 * median-based center broke completely - it got dragged toward the spoofed cluster,
 * making even the genuinely good points look "far from center" and rejecting the ENTIRE
 * flight as one continuous, never-recovered loss region. The GCS/EKF position doesn't
 * have this failure mode since ArduPilot's own EKF already discounts implausible GPS
 * jumps when computing it, regardless of what fraction of raw samples are bad. Falls back
 * to a median-based center only when there's no POS data at all to anchor against.
 */
function classifyTrack(
  points: TrackPoint[],
  gcsTrack: TrackPoint[],
  statusByT: Map<number, number>,
): { kept: TrackPoint[]; rejected: TrackPoint[] } {
  const ds = downsample(points);
  if (!ds.length) return { kept: [], rejected: [] };

  const medianCenter = gcsTrack.length ? null : { lat: median(ds.map((p) => p.lat)), lon: median(ds.map((p) => p.lon)) };

  const kept: TrackPoint[] = [];
  const rejected: TrackPoint[] = [];
  for (const p of ds) {
    const status = statusByT.get(p.t);
    if (status !== undefined && status < MIN_USABLE_GPS_STATUS) {
      rejected.push(p);
      continue;
    }
    const reference = medianCenter ?? nearestGcsPoint(gcsTrack, p.t);
    if (reference && haversine(reference.lat, reference.lon, p.lat, p.lon) > MAX_FROM_CENTER) {
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

  // Track each span's end INDEX (not just its points) so we can look up whatever comes
  // right after it in allSorted - the first trustworthy sample following the loss, i.e.
  // the actual recovery point. Isolated single-sample blips (not consecutive with any
  // other rejected sample) each get their own span here, so each pairs with its own
  // recovery point rather than being silently skipped.
  const spans: Array<{ points: TrackPoint[]; endIndex: number }> = [];
  let current: TrackPoint[] | null = null;
  for (let i = 0; i < allSorted.length; i++) {
    const p = allSorted[i]!;
    if (rejectedTimes.has(p.t)) {
      (current ??= []).push(p);
    } else if (current) {
      spans.push({ points: current, endIndex: i - 1 });
      current = null;
    }
  }
  if (current) spans.push({ points: current, endIndex: allSorted.length - 1 });

  return spans.map(({ points: span, endIndex }) => {
    const startMs = span[0]!.t;
    const lastRejectedMs = span[span.length - 1]!.t;
    // The first trustworthy sample after the loss - i.e. when GPS was actually
    // reacquired, NOT the last (still-untrustworthy) rejected sample in the span. If the
    // span runs to the end of the track, GPS was never reacquired before the log ends,
    // so there's nothing to anchor a "recovered" marker to.
    const recoveryPoint = allSorted[endIndex + 1];

    // Prefer the fused/GCS position for each marker; if there's no POS data at all, fall
    // back to the raw point's own altitude (its lat/lon during the loss is untrustworthy,
    // but altitude often isn't spoofed the same way horizontal position is).
    const startAnchor = nearestGcsPoint(gcsTrack, startMs);
    const endAnchor = recoveryPoint ? nearestGcsPoint(gcsTrack, recoveryPoint.t) : null;
    return {
      startMs,
      endMs: recoveryPoint ? recoveryPoint.t : lastRejectedMs,
      startLat: startAnchor?.lat ?? null,
      startLon: startAnchor?.lon ?? null,
      startAlt: startAnchor?.alt ?? span[0]!.alt,
      endLat: endAnchor?.lat ?? null,
      endLon: endAnchor?.lon ?? null,
      endAlt: recoveryPoint ? (endAnchor?.alt ?? recoveryPoint.alt) : null,
    };
  });
}

/**
 * Builds the flight-map's track layers from a RawLog's per-message series: the fused/GCS
 * position (POS), the raw GPS position, a teleport-rejected "cleaned" GPS track, and the
 * time ranges where raw GPS was rejected (GPS loss / spoofing regions) - based on the
 * receiver's own reported fix status (GPS.Status) when available, and position
 * plausibility otherwise.
 */
export function buildFlightMapData(series: Record<string, RawLogPoint[]>): FlightMapData | null {
  const gcsTrack = zipTrack(series["POS.Lat"], series["POS.Lng"], series["POS.RelHomeAlt"] ?? series["POS.Alt"]);
  const rawGpsTrack = zipTrack(series["GPS.Lat"], series["GPS.Lng"], series["GPS.Alt"]);

  if (!gcsTrack.length && !rawGpsTrack.length) return null;

  const gpsTrack = downsample(rawGpsTrack);
  const statusByT = new Map((series["GPS.Status"] ?? []).map((p) => [p.t, p.v]));
  const { kept, rejected } = classifyTrack(rawGpsTrack, gcsTrack, statusByT);

  return {
    gcsTrack,
    gpsTrack,
    cleanedTrack: kept,
    gpsLossRegions: groupIntoRegions(rejected, gpsTrack, gcsTrack),
  };
}
