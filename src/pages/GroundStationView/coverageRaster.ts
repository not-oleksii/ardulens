import { bearingBetween, destinationPoint, haversine } from "../../utils/geo/geo";
import type { SiteDevice } from "../../stores/groundStationSitesStore/types";
import { lobeRadiusAt } from "./lobeGeometry";

export type CoverageLevel = "clear" | "marginal" | "blocked";

export interface CoverageCell {
  lat: number;
  lon: number;
  /** Position within the square sampling grid (0-indexed, row 0 = south edge, col 0 = west
   *  edge) - lets a renderer place this cell back into a raster image without recomputing the
   *  same east/north offset math this module already did. */
  row: number;
  col: number;
  level: CoverageLevel;
}

export interface CoverageRaster {
  cells: CoverageCell[];
  /** Each cell's own footprint (meters, roughly square) - callers use this to size what they
   *  draw per cell, e.g. one canvas pixel block or one small polygon. */
  cellSizeM: number;
  /** The square grid's side length, in cells - `cells` only lists the ones inside the device's
   *  lobe, but a renderer building a `gridResolution x gridResolution` image needs the full
   *  extent to place them correctly. */
  gridResolution: number;
}

type PatternFields = Pick<SiteDevice, "lat" | "lon" | "altitudeM" | "pattern" | "rangeM" | "bearingDeg" | "beamwidthDeg">;

interface ComputeCoverageOptions {
  device: PatternFields;
  /** Terrain height (meters above the WGS84 ellipsoid - same convention as
   *  SiteDevice.altitudeM) at a batch of points in one call, matching this app's own terrain-
   *  sampling convention (e.g. CesiumMapView's home-height lookup) - batched so the raster's
   *  own resolution doesn't turn into one round trip per cell. */
  sampleTerrain: (points: { lat: number; lon: number }[]) => Promise<number[]>;
  /** How many cells span the device's full range diameter - the raster's resolution. Kept
   *  modest by default: this is the plan's flagged "prototype the rendering approach first"
   *  phase, not a finished high-resolution model, and every cell costs `losSamples + 1` terrain
   *  queries. */
  gridResolution?: number;
  /** How many points to check for an obstruction along each cell's line-of-sight path, between
   *  the device and the cell (exclusive of both endpoints) - higher catches thinner
   *  obstructions at a steeper terrain-query cost (roughly gridResolution^2 * losSamples total
   *  queries for an omnidirectional device). */
  losSamples?: number;
  /** Assumed receiver height above bare ground at each cell, in meters - a handheld radio or
   *  GPS isn't sitting directly on the terrain surface. */
  receiverHeightM?: number;
  /** The clear/marginal split, as a fraction of the lobe's radius in that direction - inside
   *  this fraction with a clean line of sight is "clear," beyond it (but still in range) is
   *  "marginal," matching the plan's own "well within range" vs "near-edge" wording. */
  marginalFraction?: number;
}

const DEFAULT_GRID_RESOLUTION = 16;
const DEFAULT_LOS_SAMPLES = 3;
const DEFAULT_RECEIVER_HEIGHT_M = 2;
const DEFAULT_MARGINAL_FRACTION = 0.7;

interface CandidateCell {
  lat: number;
  lon: number;
  row: number;
  col: number;
  distanceM: number;
  maxRangeM: number;
  /** Index into the flat terrain-sample batch for this cell's own ground point. */
  cellSampleIndex: number;
  /** Indices into the flat terrain-sample batch for this cell's intermediate LOS check points,
   *  device-to-cell, nearest-to-device first. */
  losSampleIndices: number[];
}

/**
 * A per-device terrain line-of-sight coverage raster: samples a square grid of points within the
 * device's own coverage lobe (see lobeGeometry.ts - the same simplified 2D pattern this raster
 * respects, rather than covering the full bounding square), classifies each as clear/marginal/
 * blocked by checking the straight sightline from the device down to that point against the real
 * terrain profile in between, and returns only the classified cells for the caller to draw.
 *
 * All terrain height lookups happen in exactly one batched call via `sampleTerrain`, regardless
 * of grid resolution, so raising resolution only costs more math, not more round trips.
 */
export async function computeCoverageRaster({
  device,
  sampleTerrain,
  gridResolution = DEFAULT_GRID_RESOLUTION,
  losSamples = DEFAULT_LOS_SAMPLES,
  receiverHeightM = DEFAULT_RECEIVER_HEIGHT_M,
  marginalFraction = DEFAULT_MARGINAL_FRACTION,
}: ComputeCoverageOptions): Promise<CoverageRaster> {
  const cellSizeM = (2 * device.rangeM) / gridResolution;
  const half = (gridResolution - 1) / 2;

  const points: { lat: number; lon: number }[] = [];
  const candidates: CandidateCell[] = [];

  for (let row = 0; row < gridResolution; row++) {
    for (let col = 0; col < gridResolution; col++) {
      // Local flat-earth offset in meters, then converted to a real lat/lon via the same
      // bearing+distance formula the rest of this feature already uses - fine at these ranges
      // (a few km at most), same tolerance CesiumMapView/geo.ts already accept elsewhere.
      const eastM = (col - half) * cellSizeM;
      const northM = (row - half) * cellSizeM;
      const distanceM = Math.hypot(eastM, northM);
      if (distanceM === 0) continue; // the device's own cell - not a coverage point.
      const bearingDeg = (Math.atan2(eastM, northM) * 180) / Math.PI;
      const maxRangeM = lobeRadiusAt(device, bearingDeg);
      if (distanceM > maxRangeM) continue; // outside the lobe for this direction - skip entirely.

      const cell = destinationPoint(device.lat, device.lon, bearingDeg, distanceM);
      const cellSampleIndex = points.length;
      points.push(cell);

      const losSampleIndices: number[] = [];
      for (let s = 1; s <= losSamples; s++) {
        const fraction = s / (losSamples + 1);
        losSampleIndices.push(points.length);
        points.push(destinationPoint(device.lat, device.lon, bearingDeg, distanceM * fraction));
      }

      candidates.push({ lat: cell.lat, lon: cell.lon, row, col, distanceM, maxRangeM, cellSampleIndex, losSampleIndices });
    }
  }

  const heights = points.length > 0 ? await sampleTerrain(points) : [];

  const cells: CoverageCell[] = candidates.map((candidate) => {
    const cellGroundHeight = heights[candidate.cellSampleIndex] ?? 0;
    const level = classifyLevel({
      deviceAltitudeM: device.altitudeM,
      targetHeight: cellGroundHeight + receiverHeightM,
      distanceM: candidate.distanceM,
      maxRangeM: candidate.maxRangeM,
      losSampleHeights: candidate.losSampleIndices.map((i) => heights[i] ?? 0),
      losSamples,
      marginalFraction,
    });
    return { lat: candidate.lat, lon: candidate.lon, row: candidate.row, col: candidate.col, level };
  });

  return { cells, cellSizeM, gridResolution };
}

/** Classifies one device/cell pair's line of sight - shared by the single-device raster above
 *  and the combined multi-device raster below, which otherwise duplicate this exact check once
 *  per device per cell. */
function classifyLevel({
  deviceAltitudeM,
  targetHeight,
  distanceM,
  maxRangeM,
  losSampleHeights,
  losSamples,
  marginalFraction,
}: {
  deviceAltitudeM: number;
  targetHeight: number;
  distanceM: number;
  maxRangeM: number;
  losSampleHeights: number[];
  losSamples: number;
  marginalFraction: number;
}): CoverageLevel {
  // A straight line from the device's own (already-absolute) altitude down to the target - any
  // intermediate terrain sample poking above this line blocks the shot.
  for (let i = 0; i < losSampleHeights.length; i++) {
    const fraction = (i + 1) / (losSamples + 1);
    const sightlineHeight = deviceAltitudeM + (targetHeight - deviceAltitudeM) * fraction;
    if (losSampleHeights[i]! > sightlineHeight) return "blocked";
  }
  return distanceM <= maxRangeM * marginalFraction ? "clear" : "marginal";
}

const LEVEL_RANK: Record<CoverageLevel, number> = { blocked: 0, marginal: 1, clear: 2 };
const DEFAULT_COMBINED_GRID_RESOLUTION = 40;
const MIN_CELLS_ACROSS_SMALLEST_DEVICE = 16;
const MAX_COMBINED_GRID_CELLS = 160_000;

interface ComputeCombinedCoverageOptions {
  devices: PatternFields[];
  sampleTerrain: (points: { lat: number; lon: number }[]) => Promise<number[]>;
  /** Cells along the LARGER of the combined area's two dimensions - the other dimension gets
   *  proportionally fewer/more cells so each cell stays roughly square in meters, rather than
   *  forcing a square grid onto a non-square combined bounding box. */
  gridResolution?: number;
  losSamples?: number;
  receiverHeightM?: number;
  marginalFraction?: number;
}

export interface CombinedCoverageRaster {
  cells: CoverageCell[];
  rows: number;
  cols: number;
  /** The combined grid's corners, in [lon, lat] pairs, top-left/top-right/bottom-right/
   *  bottom-left order (MapLibre's own image-source coordinate order) - unlike the single-device
   *  raster, this grid isn't centered on any one device, so a renderer needs the actual bounds
   *  rather than being able to re-derive them from a single device's own lat/lon/rangeM. */
  corners: [[number, number], [number, number], [number, number], [number, number]];
}

/**
 * A combined line-of-sight coverage raster across MULTIPLE devices at once: for every cell in
 * one shared grid spanning all the devices' own coverage areas, takes the BEST classification
 * any single device provides there (clear beats marginal beats blocked) - "where is safe to fly,
 * given everything currently placed," rather than requiring a viewer to mentally combine several
 * independent per-device overlays whose blended colors don't actually mean anything on their own.
 *
 * Still one batched `sampleTerrain` call for the whole computation, regardless of device count or
 * resolution - each cell's own ground height is looked up once and shared across every device
 * that might cover it; only the line-of-sight path samples (which start from each device's own
 * position) are necessarily per-device.
 */
export async function computeCombinedCoverageRaster({
  devices,
  sampleTerrain,
  gridResolution = DEFAULT_COMBINED_GRID_RESOLUTION,
  losSamples = DEFAULT_LOS_SAMPLES,
  receiverHeightM = DEFAULT_RECEIVER_HEIGHT_M,
  marginalFraction = DEFAULT_MARGINAL_FRACTION,
}: ComputeCombinedCoverageOptions): Promise<CombinedCoverageRaster> {
  if (devices.length === 0) {
    return { cells: [], rows: 0, cols: 0, corners: [[0, 0], [0, 0], [0, 0], [0, 0]] };
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const device of devices) {
    const north = destinationPoint(device.lat, device.lon, 0, device.rangeM);
    const south = destinationPoint(device.lat, device.lon, 180, device.rangeM);
    const east = destinationPoint(device.lat, device.lon, 90, device.rangeM);
    const west = destinationPoint(device.lat, device.lon, 270, device.rangeM);
    minLat = Math.min(minLat, south.lat);
    maxLat = Math.max(maxLat, north.lat);
    minLon = Math.min(minLon, west.lon);
    maxLon = Math.max(maxLon, east.lon);
  }

  const centerLat = (minLat + maxLat) / 2;
  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos((centerLat * Math.PI) / 180);
  const latSpanM = (maxLat - minLat) * metersPerDegLat;
  const lonSpanM = (maxLon - minLon) * metersPerDegLon;
  // A fixed cell count across the WHOLE union bounding box under-samples any device whose own
  // range is small relative to how spread out the devices are - e.g. three devices a few km
  // apart with 300m ranges would get a ~150m cell size from `gridResolution` alone, leaving each
  // device only a handful of cells (or none) and making its coverage all but invisible. Also
  // resolving to at least MIN_CELLS_ACROSS_SMALLEST_DEVICE cells across the SMALLEST device's own
  // diameter - whichever of the two produces the finer (smaller) cell - fixes that without
  // penalizing the common case where devices' ranges are already comparable to their spread.
  // Clamped to a total-cell budget so an extreme outlier (a tiny-range device far from everything
  // else) can't blow up the grid to an unreasonable size.
  const spanCellSizeM = Math.max(latSpanM, lonSpanM, 1) / gridResolution;
  const minRangeM = Math.min(...devices.map((d) => d.rangeM));
  const desiredCellSizeM = (2 * minRangeM) / MIN_CELLS_ACROSS_SMALLEST_DEVICE;
  const budgetCellSizeM = Math.sqrt(Math.max(latSpanM * lonSpanM, 1) / MAX_COMBINED_GRID_CELLS);
  const cellSizeM = Math.max(budgetCellSizeM, Math.min(spanCellSizeM, desiredCellSizeM));
  const rows = Math.max(1, Math.round(latSpanM / cellSizeM));
  const cols = Math.max(1, Math.round(lonSpanM / cellSizeM));

  const points: { lat: number; lon: number }[] = [];
  interface CellCandidate {
    lat: number;
    lon: number;
    row: number;
    col: number;
    groundSampleIndex: number;
    deviceCandidates: { device: PatternFields; distanceM: number; maxRangeM: number; losSampleIndices: number[] }[];
  }
  const cellCandidates: CellCandidate[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const lat = minLat + ((row + 0.5) / rows) * (maxLat - minLat);
      const lon = minLon + ((col + 0.5) / cols) * (maxLon - minLon);

      const deviceCandidates: CellCandidate["deviceCandidates"] = [];
      for (const device of devices) {
        const distanceM = haversine(device.lat, device.lon, lat, lon);
        const bearingDeg = bearingBetween(device.lat, device.lon, lat, lon);
        const maxRangeM = lobeRadiusAt(device, bearingDeg);
        if (distanceM > maxRangeM) continue; // outside THIS device's lobe - it doesn't cover this cell.

        const losSampleIndices: number[] = [];
        for (let s = 1; s <= losSamples; s++) {
          const fraction = s / (losSamples + 1);
          losSampleIndices.push(points.length);
          points.push(destinationPoint(device.lat, device.lon, bearingDeg, distanceM * fraction));
        }
        deviceCandidates.push({ device, distanceM, maxRangeM, losSampleIndices });
      }
      if (deviceCandidates.length === 0) continue; // no device covers this cell at all.

      const groundSampleIndex = points.length;
      points.push({ lat, lon });
      cellCandidates.push({ lat, lon, row, col, groundSampleIndex, deviceCandidates });
    }
  }

  const heights = points.length > 0 ? await sampleTerrain(points) : [];

  const cells: CoverageCell[] = cellCandidates.map((candidate) => {
    const targetHeight = (heights[candidate.groundSampleIndex] ?? 0) + receiverHeightM;
    let best: CoverageLevel = "blocked";
    for (const dc of candidate.deviceCandidates) {
      const level = classifyLevel({
        deviceAltitudeM: dc.device.altitudeM,
        targetHeight,
        distanceM: dc.distanceM,
        maxRangeM: dc.maxRangeM,
        losSampleHeights: dc.losSampleIndices.map((i) => heights[i] ?? 0),
        losSamples,
        marginalFraction,
      });
      if (LEVEL_RANK[level] > LEVEL_RANK[best]) best = level;
      if (best === "clear") break; // can't do better than clear - no need to check remaining devices.
    }
    return { lat: candidate.lat, lon: candidate.lon, row: candidate.row, col: candidate.col, level: best };
  });

  const north = maxLat;
  const south = minLat;
  const west = minLon;
  const east = maxLon;
  return {
    cells,
    rows,
    cols,
    corners: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
  };
}
