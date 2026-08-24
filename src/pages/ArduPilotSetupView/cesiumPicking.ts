import { Cartographic, Math as CesiumMath, type Cartesian2, type Viewer } from "cesium";

/**
 * Converts a screen-space click into real lat/lon degrees, picking against the actually-loaded
 * terrain mesh rather than a flat WGS84 ellipsoid - `camera.pickEllipsoid` alone assumes sea
 * level everywhere, so on real terrain (hills, city elevation - exactly what Cesium World
 * Terrain loads) the result can land noticeably away from the pixel the user actually clicked,
 * a well-documented Cesium gotcha. Falls back to the flat-ellipsoid pick only if no terrain
 * tile is loaded yet at that spot (e.g. still fetching).
 */
export function pickLatLon(viewer: Viewer, screenPosition: Cartesian2): { lat: number; lon: number } | null {
  const ray = viewer.camera.getPickRay(screenPosition);
  const cartesian = (ray && viewer.scene.globe.pick(ray, viewer.scene)) ?? viewer.camera.pickEllipsoid(screenPosition, viewer.scene.globe.ellipsoid);
  if (!cartesian) return null;
  const carto = Cartographic.fromCartesian(cartesian);
  return { lat: CesiumMath.toDegrees(carto.latitude), lon: CesiumMath.toDegrees(carto.longitude) };
}
