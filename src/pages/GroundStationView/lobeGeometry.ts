import { destinationPoint } from "../../utils/geo/geo";
import type { SiteDevice } from "../../stores/groundStationSitesStore/types";

const RING_SAMPLES = 64;

type PatternFields = Pick<SiteDevice, "pattern" | "rangeM" | "bearingDeg" | "beamwidthDeg">;

/** The device's coverage-lobe radius (meters) at a given absolute compass bearing - the same
 *  deliberately simplified 2D pattern approximation the plan calls for, factored out so both the
 *  outline drawn on the map (below) and the coverage raster's cell-membership test (see
 *  coverageRaster.ts) share one definition of "is this direction/point inside the lobe." */
export function lobeRadiusAt(device: PatternFields, angleDeg: number): number {
  const { pattern, rangeM, bearingDeg, beamwidthDeg } = device;

  if (pattern === "omni") return rangeM;

  if (pattern === "dipole") {
    // A polar rose r(theta) = range * |cos(theta - bearing)| - two lobes along the bearing axis,
    // pinched to 0 at +/-90 degrees off it - the figure-eight the plan calls for.
    const relative = ((angleDeg - bearingDeg) * Math.PI) / 180;
    return rangeM * Math.abs(Math.cos(relative));
  }

  // "directional": full range inside the bearing-centered beamwidthDeg sector, 0 outside it.
  return Math.abs(angleDelta(angleDeg, bearingDeg)) <= beamwidthDeg / 2 ? rangeM : 0;
}

/** Smallest signed difference (degrees, -180..180) from `b` to `a`, correctly wrapping across
 *  the 0/360 seam - a plain `a - b` breaks for e.g. bearing 350 vs an angle of 10. */
function angleDelta(a: number, b: number): number {
  return (((a - b) % 360) + 540) % 360 - 180;
}

/** The top-down outline of a device's coverage lobe, as a closed ring of [lon, lat] pairs
 *  (Cesium's own `Cartesian3.fromDegreesArray` argument order) - the deliberately simplified 2D
 *  approximation decided in the Ground Station plan, not a real 3D radiation pattern. */
export function lobeOutline(device: Pick<SiteDevice, "lat" | "lon" | "pattern" | "rangeM" | "bearingDeg" | "beamwidthDeg">): number[][] {
  const { lat, lon, pattern, bearingDeg, beamwidthDeg } = device;

  if (pattern !== "directional") {
    return sampleArc(lat, lon, 0, 360, RING_SAMPLES, (angle) => lobeRadiusAt(device, angle));
  }

  // Sampled only across the sector itself (not the full circle) so a narrow beamwidth still gets
  // a smooth arc rather than a handful of samples spread across 360 degrees - closed back through
  // the device's own position so it renders as a filled pie slice.
  const half = beamwidthDeg / 2;
  const sectorSamples = Math.max(8, Math.round((RING_SAMPLES * beamwidthDeg) / 360));
  const arc = sampleArc(lat, lon, bearingDeg - half, bearingDeg + half, sectorSamples, (angle) => lobeRadiusAt(device, angle));
  return [[lon, lat], ...arc, [lon, lat]];
}

function sampleArc(
  lat: number,
  lon: number,
  fromDeg: number,
  toDeg: number,
  samples: number,
  radiusAt: (angleDeg: number) => number,
): number[][] {
  const points: number[][] = [];
  for (let i = 0; i <= samples; i++) {
    const angle = fromDeg + ((toDeg - fromDeg) * i) / samples;
    const point = destinationPoint(lat, lon, angle, radiusAt(angle));
    points.push([point.lon, point.lat]);
  }
  return points;
}
