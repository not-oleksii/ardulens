import { describe, expect, it, vi } from "vitest";
import { computeCombinedCoverageRaster, computeCoverageRaster } from "../coverageRaster";

const OMNI = { lat: 0, lon: 0, altitudeM: 100, pattern: "omni" as const, rangeM: 1000, bearingDeg: 0, beamwidthDeg: 360 };

function flatTerrain(heightM: number) {
  return (points: { lat: number; lon: number }[]) => Promise.resolve(points.map(() => heightM));
}

describe("computeCoverageRaster", () => {
  it("flat terrain: near cells are clear, far cells are marginal, nothing is blocked", async () => {
    const { cells } = await computeCoverageRaster({ device: OMNI, sampleTerrain: flatTerrain(0) });

    expect(cells.length).toBeGreaterThan(0);
    expect(cells.some((c) => c.level === "clear")).toBe(true);
    expect(cells.some((c) => c.level === "marginal")).toBe(true);
    expect(cells.every((c) => c.level !== "blocked")).toBe(true);
  });

  it("terrain well above a low-mounted device blocks most of the grid", async () => {
    const lowDevice = { ...OMNI, altitudeM: 5 };

    const { cells } = await computeCoverageRaster({ device: lowDevice, sampleTerrain: flatTerrain(50) });

    expect(cells.some((c) => c.level === "blocked")).toBe(true);
  });

  it("directional pattern only includes cells within the sector, never behind the device", async () => {
    const directional = { lat: 0, lon: 0, altitudeM: 100, pattern: "directional" as const, rangeM: 500, bearingDeg: 90, beamwidthDeg: 30 };

    const { cells } = await computeCoverageRaster({ device: directional, sampleTerrain: flatTerrain(0) });

    expect(cells.length).toBeGreaterThan(0);
    // Pointed due east with a narrow sector - every cell should be east of the device, never west.
    expect(cells.every((c) => c.lon > directional.lon)).toBe(true);
  });

  it("samples terrain in exactly one batched call regardless of grid resolution", async () => {
    const sampleTerrain = vi.fn(flatTerrain(0));

    await computeCoverageRaster({ device: OMNI, sampleTerrain, gridResolution: 12 });

    expect(sampleTerrain).toHaveBeenCalledTimes(1);
  });

  it("cellSizeM scales with range and resolution", async () => {
    const { cellSizeM } = await computeCoverageRaster({ device: OMNI, sampleTerrain: flatTerrain(0), gridResolution: 20 });

    expect(cellSizeM).toBeCloseTo((2 * OMNI.rangeM) / 20);
  });
});

describe("computeCombinedCoverageRaster", () => {
  it("returns an empty raster for no devices", async () => {
    const result = await computeCombinedCoverageRaster({ devices: [], sampleTerrain: flatTerrain(0) });

    expect(result.cells).toEqual([]);
    expect(result.rows).toBe(0);
    expect(result.cols).toBe(0);
  });

  it("covers the union of two non-overlapping devices' areas, not just their intersection", async () => {
    const near = { ...OMNI, lat: 0, lon: 0, rangeM: 500 };
    const far = { ...OMNI, lat: 0, lon: 0.05, rangeM: 500 }; // ~5.5km east - well outside `near`'s range.

    const { cells } = await computeCombinedCoverageRaster({ devices: [near, far], sampleTerrain: flatTerrain(0) });

    expect(cells.some((c) => c.lon < 0.02)).toBe(true); // covered by `near`
    expect(cells.some((c) => c.lon > 0.03)).toBe(true); // covered by `far`
  });

  it("best-coverage-wins: a cell blocked for one device but clear for another shows clear", async () => {
    const blockedFromHere = { ...OMNI, lat: 0, lon: 0, altitudeM: 1, rangeM: 1000 }; // low mast
    const clearFromHere = { ...OMNI, lat: 0, lon: 0.002, altitudeM: 1000, rangeM: 1000 }; // tall mast, right next to it

    // Uniformly high terrain blocks the low device (its sightline starts below the terrain
    // height everywhere) but not the tall one.
    const { cells } = await computeCombinedCoverageRaster({
      devices: [blockedFromHere, clearFromHere],
      sampleTerrain: flatTerrain(50),
    });

    expect(cells.length).toBeGreaterThan(0);
    expect(cells.some((c) => c.level === "clear" || c.level === "marginal")).toBe(true);
  });

  it("samples terrain in exactly one batched call regardless of device count", async () => {
    const sampleTerrain = vi.fn(flatTerrain(0));
    const devices = [
      { ...OMNI, lat: 0, lon: 0 },
      { ...OMNI, lat: 0.01, lon: 0.01 },
      { ...OMNI, lat: -0.01, lon: -0.01 },
    ];

    await computeCombinedCoverageRaster({ devices, sampleTerrain });

    expect(sampleTerrain).toHaveBeenCalledTimes(1);
  });

  it("corners encompass every device's own coverage circle", async () => {
    const devices = [
      { ...OMNI, lat: 0, lon: 0, rangeM: 500 },
      { ...OMNI, lat: 0.02, lon: 0.02, rangeM: 500 },
    ];

    const { corners } = await computeCombinedCoverageRaster({ devices, sampleTerrain: flatTerrain(0) });
    const [topLeft, topRight, bottomRight, bottomLeft] = corners;

    expect(topLeft[1]).toBeGreaterThan(0.02); // north edge above the northernmost device
    expect(bottomLeft[1]).toBeLessThan(0); // south edge below the southernmost device
    expect(topRight[0]).toBeGreaterThan(0.02); // east edge beyond the easternmost device
    expect(topLeft[0]).toBeLessThan(0); // west edge before the westernmost device
    expect(bottomRight).toEqual([topRight[0], bottomLeft[1]]);
  });
});
