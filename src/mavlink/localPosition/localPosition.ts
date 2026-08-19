const EARTH_RADIUS_M = 6371000;

export interface LocalOffsetM {
  /** Meters east of the origin - negative is west. */
  east: number;
  /** Meters north of the origin - negative is south. */
  north: number;
}

/**
 * Converts (lat, lon) into local east/north meters relative to an origin, using an
 * equirectangular approximation (flat-earth, scaled by cos(originLat) for longitude) - accurate
 * to well under 1% over the few-kilometer ranges a tokenless position radar covers, not
 * intended for long-range navigation math.
 */
export function localOffsetMeters(lat: number, lon: number, originLat: number, originLon: number): LocalOffsetM {
  const originLatRad = (originLat * Math.PI) / 180;
  const north = (((lat - originLat) * Math.PI) / 180) * EARTH_RADIUS_M;
  const east = (((lon - originLon) * Math.PI) / 180) * EARTH_RADIUS_M * Math.cos(originLatRad);
  return { east, north };
}

/**
 * Picks a "nice" round display radius (in meters) that comfortably fits the farthest point seen
 * so far - one of a small fixed set of round numbers (never an arbitrary computed value like
 * "137m"), matching how a real radar/range-ring display always uses clean ring spacing.
 */
export function niceRadiusMeters(farthestDistanceM: number): number {
  const steps = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];
  for (const step of steps) {
    if (farthestDistanceM <= step) return step;
  }
  return steps[steps.length - 1]!;
}
