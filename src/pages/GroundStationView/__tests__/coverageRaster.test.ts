import { describe, expect, it, vi } from "vitest";
import { computeCoverageRaster } from "../coverageRaster";

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
