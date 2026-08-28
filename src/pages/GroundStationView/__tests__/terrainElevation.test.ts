import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeTerrariumHeight, sampleTerrainElevations } from "../terrainElevation";

describe("decodeTerrariumHeight", () => {
  it("decodes the documented Terrarium formula (R*256 + G + B/256 - 32768)", () => {
    expect(decodeTerrariumHeight(0, 0, 0)).toBeCloseTo(-32768);
    expect(decodeTerrariumHeight(128, 0, 0)).toBeCloseTo(128 * 256 - 32768);
    expect(decodeTerrariumHeight(128, 100, 128)).toBeCloseTo(128 * 256 + 100 + 128 / 256 - 32768);
  });
});

describe("sampleTerrainElevations", () => {
  let imageLoads: string[] = [];

  beforeEach(() => {
    imageLoads = [];
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        crossOrigin = "";
        set src(url: string) {
          imageLoads.push(url);
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(256 * 256 * 4) }),
    } as unknown as CanvasRenderingContext2D);
  });

  it("fetches one tile per unique tile, even when several points share it", async () => {
    // Two points a few meters apart share a tile at this zoom level; a point on another
    // continent doesn't.
    await sampleTerrainElevations([
      { lat: 20.001, lon: 40.001 },
      { lat: 20.0011, lon: 40.0011 },
      { lat: -33.5, lon: 151.2 },
    ]);

    expect(imageLoads).toHaveLength(2);
  });

  it("returns one result per input point, in the same order", async () => {
    const results = await sampleTerrainElevations([
      { lat: 25.5, lon: 60.5 },
      { lat: 26.5, lon: 61.5 },
      { lat: 27.5, lon: 62.5 },
    ]);

    expect(results).toHaveLength(3);
    expect(results.every((h) => Number.isFinite(h))).toBe(true);
  });
});
