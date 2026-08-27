import { describe, expect, it } from "vitest";
import { cleanTrack, destinationPoint, haversine, median, trackStats } from "../geo";
import type { Flight } from "../../../types";

describe("haversine", () => {
  it("returns ~0 for identical points", () => {
    expect(haversine(50, 30, 50, 30)).toBe(0);
  });

  it("matches the known ~111.19 km for one degree of latitude at the equator", () => {
    const d = haversine(0, 0, 1, 0);
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });
});

describe("destinationPoint", () => {
  it("moving due north increases latitude and leaves longitude unchanged", () => {
    const { lat, lon } = destinationPoint(0, 0, 0, 111_000);
    expect(lat).toBeCloseTo(1, 1);
    expect(lon).toBeCloseTo(0, 6);
  });

  it("moving due east increases longitude and leaves latitude unchanged (at the equator)", () => {
    const { lat, lon } = destinationPoint(0, 0, 90, 111_000);
    expect(lon).toBeCloseTo(1, 1);
    expect(lat).toBeCloseTo(0, 6);
  });

  it("round-trips with haversine - the distance to the computed destination matches the input", () => {
    const dest = destinationPoint(50, 30, 137, 5_000);
    expect(haversine(50, 30, dest.lat, dest.lon)).toBeCloseTo(5_000, 0);
  });
});

describe("median", () => {
  it("returns 0 for an empty array", () => {
    expect(median([])).toBe(0);
  });

  it("picks the upper-middle element (matches legacy behavior)", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([3, 1, 2, 4])).toBe(3);
  });
});

describe("cleanTrack", () => {
  it("returns empty result for no points", () => {
    expect(cleanTrack([])).toEqual({ points: [], removed: 0 });
  });

  it("downsamples sub-second points to ~1Hz", () => {
    const pts = [
      { t: 0, lat: 50, lon: 30 },
      { t: 200, lat: 50.00001, lon: 30 },
      { t: 500, lat: 50.00002, lon: 30 },
      { t: 1100, lat: 50.00003, lon: 30 },
    ];
    const { points } = cleanTrack(pts);
    expect(points).toHaveLength(2);
  });

  it("drops points that imply an impossible jump speed (spoofing/EW)", () => {
    const pts = [
      { t: 0, lat: 50.0, lon: 30.0 },
      { t: 1000, lat: 50.001, lon: 30.001 }, // plausible step
      { t: 2000, lat: 51.0, lon: 40.0 }, // teleport
      { t: 3000, lat: 50.002, lon: 30.002 }, // back to plausible track
    ];
    const { points, removed } = cleanTrack(pts);
    expect(removed).toBe(1);
    expect(points.map((p) => p.lat)).not.toContain(51.0);
  });

  it("rejects points far from the median center (300km+)", () => {
    const pts = [
      { t: 0, lat: 50.0, lon: 30.0 },
      { t: 1000, lat: 50.001, lon: 30.001 },
      { t: 2000, lat: 50.002, lon: 30.002 },
      { t: 3000, lat: 60.0, lon: 40.0 }, // far outlier
    ];
    const { removed } = cleanTrack(pts);
    expect(removed).toBeGreaterThanOrEqual(1);
  });
});

describe("trackStats", () => {
  function makeFlight(): Flight {
    return {
      board: "1",
      timeReliable: true,
      fmt: "skylog",
      samples: [
        { t: 0, lat: 50.0, lon: 30.0 },
        { t: 1000, lat: 50.001, lon: 30.0 },
        { t: 2000, lat: 50.002, lon: 30.0 },
      ],
    };
  }

  it("computes max distance from base and path length", () => {
    const f = makeFlight();
    const stats = trackStats(f);
    expect(stats.maxd).not.toBeNull();
    expect(stats.maxd).toBeGreaterThan(0);
    expect(stats.path).not.toBeNull();
    expect(stats.removed).toBe(0);
  });

  it("caches the result on the flight object", () => {
    const f = makeFlight();
    const first = trackStats(f);
    expect(f.__t).toBe(first);
    expect(trackStats(f)).toBe(first);
  });

  it("returns nulls when there is no valid position data", () => {
    const f: Flight = { board: "1", timeReliable: true, fmt: "skylog", samples: [{ t: 0 }] };
    const stats = trackStats(f);
    expect(stats.maxd).toBeNull();
    expect(stats.path).toBeNull();
  });
});
