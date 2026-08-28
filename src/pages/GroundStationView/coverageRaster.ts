import { destinationPoint } from "../../utils/geo/geo";
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
    const targetHeight = cellGroundHeight + receiverHeightM;

    // A straight line from the device's own (already-absolute) altitude down to the target -
    // any intermediate terrain sample poking above this line blocks the shot.
    let blocked = false;
    for (let i = 0; i < candidate.losSampleIndices.length; i++) {
      const fraction = (i + 1) / (losSamples + 1);
      const sightlineHeight = device.altitudeM + (targetHeight - device.altitudeM) * fraction;
      const terrainHeight = heights[candidate.losSampleIndices[i]!] ?? 0;
      if (terrainHeight > sightlineHeight) {
        blocked = true;
        break;
      }
    }

    const level: CoverageLevel = blocked
      ? "blocked"
      : candidate.distanceM <= candidate.maxRangeM * marginalFraction
        ? "clear"
        : "marginal";
    return { lat: candidate.lat, lon: candidate.lon, row: candidate.row, col: candidate.col, level };
  });

  return { cells, cellSizeM, gridResolution };
}
