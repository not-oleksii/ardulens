import { MAX_FROM_CENTER, MAX_STEP_SPEED } from "../../constants";
import type { Flight, TrackStats } from "../../types";
import type { GeoPoint } from "./types";

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const p1 = lat1 * rad;
  const p2 = lat2 * rad;
  const dp = (lat2 - lat1) * rad;
  const dl = (lon2 - lon1) * rad;
  const x =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** The point a given bearing (degrees, compass, clockwise from north) and distance (meters) from
 *  a start point - the standard spherical-Earth destination formula, the reverse of `haversine`
 *  above (which solves "how far apart" rather than "where is X meters away"). */
export function destinationPoint(lat: number, lon: number, bearingDeg: number, distanceM: number): { lat: number; lon: number } {
  const R = 6371000;
  const rad = Math.PI / 180;
  const bearing = bearingDeg * rad;
  const lat1 = lat * rad;
  const angularDistance = distanceM / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
  const lon2 =
    lon * rad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: lat2 / rad, lon: lon2 / rad };
}

export function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  return s.length ? s[s.length >> 1]! : 0;
}

/** Downsample track to ~1 Hz and drop teleport outliers (GPS spoofing / EW). */
export function cleanTrack(pts: GeoPoint[]): { points: GeoPoint[]; removed: number } {
  if (!pts.length) return { points: [], removed: 0 };

  const ds: GeoPoint[] = [];
  let lastT: number | null = null;
  for (const p of pts) {
    if (lastT === null || p.t - lastT >= 1000) {
      ds.push(p);
      lastT = p.t;
    }
  }

  const cLat = median(ds.map((p) => p.lat));
  const cLon = median(ds.map((p) => p.lon));
  const near = ds.filter((p) => haversine(cLat, cLon, p.lat, p.lon) <= MAX_FROM_CENTER);

  const out: GeoPoint[] = near.length ? [near[0]!] : [];
  for (let k = 1; k < near.length; k++) {
    const a = out[out.length - 1]!;
    const b = near[k]!;
    const dt = Math.abs(b.t - a.t) / 1000;
    const d = haversine(a.lat, a.lon, b.lat, b.lon);
    if (dt > 0 && d / dt > MAX_STEP_SPEED) continue; // impossible jump -> skip
    out.push(b);
  }
  return { points: out, removed: ds.length - out.length };
}

/** Max distance from base + path length (cached per flight). */
export function trackStats(flight: Flight): TrackStats {
  if (flight.__t) return flight.__t;

  const pts: GeoPoint[] = [];
  for (const s of flight.samples) {
    if (
      typeof s.lat === "number" &&
      typeof s.lon === "number" &&
      Math.abs(s.lat) > 1e-4 &&
      Math.abs(s.lon) > 1e-4
    ) {
      pts.push({ t: s.t, lat: s.lat, lon: s.lon });
    }
  }

  const c = cleanTrack(pts);
  let maxd: number | null = null;
  let path = 0;
  const base = c.points[0];
  let prev: GeoPoint | null = null;
  if (base) {
    maxd = 0;
    for (const p of c.points) {
      const d = haversine(base.lat, base.lon, p.lat, p.lon);
      if (d > maxd) maxd = d;
      if (prev) path += haversine(prev.lat, prev.lon, p.lat, p.lon);
      prev = p;
    }
  }

  flight.__t = { maxd, path: c.points.length ? path / 1000 : null, removed: c.removed };
  return flight.__t;
}
