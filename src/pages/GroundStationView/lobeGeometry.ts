import { destinationPoint } from "../../utils/geo/geo";
import type { SiteDevice } from "../../stores/groundStationSitesStore/types";

const RING_SAMPLES = 64;

/** The top-down outline of a device's coverage lobe, as a closed ring of [lon, lat] pairs
 *  (Cesium's own `Cartesian3.fromDegreesArray` argument order) - the deliberately simplified 2D
 *  approximation decided in the Ground Station plan, not a real 3D radiation pattern. */
export function lobeOutline(device: Pick<SiteDevice, "lat" | "lon" | "pattern" | "rangeM" | "bearingDeg" | "beamwidthDeg">): number[][] {
  const { lat, lon, pattern, rangeM, bearingDeg, beamwidthDeg } = device;

  if (pattern === "omni") {
    return sampleArc(lat, lon, 0, 360, RING_SAMPLES, () => rangeM);
  }

  if (pattern === "dipole") {
    // A polar rose r(theta) = range * |cos(theta - bearing)| - two lobes along the bearing axis,
    // pinched to 0 at +/-90 degrees off it - the figure-eight the plan calls for.
    return sampleArc(lat, lon, 0, 360, RING_SAMPLES, (angleDeg) => {
      const relative = ((angleDeg - bearingDeg) * Math.PI) / 180;
      return rangeM * Math.abs(Math.cos(relative));
    });
  }

  // "directional": a bearing-centered sector out to `rangeM`, closed back through the device's
  // own position so it renders as a filled pie slice rather than just an arc.
  const half = beamwidthDeg / 2;
  const sectorSamples = Math.max(8, Math.round((RING_SAMPLES * beamwidthDeg) / 360));
  const arc = sampleArc(lat, lon, bearingDeg - half, bearingDeg + half, sectorSamples, () => rangeM);
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
