import { describe, expect, it } from "vitest";
import { localOffsetMeters, niceRadiusMeters } from "../localPosition";

describe("localOffsetMeters", () => {
  it("returns zero offset for the origin itself", () => {
    expect(localOffsetMeters(50.45, 30.52, 50.45, 30.52)).toEqual({ east: 0, north: 0 });
  });

  it("moving north increases north and leaves east at zero", () => {
    // ~0.001 deg latitude is ~111m at any longitude.
    const { east, north } = localOffsetMeters(50.451, 30.52, 50.45, 30.52);
    expect(north).toBeCloseTo(111, 0);
    expect(east).toBeCloseTo(0, 6);
  });

  it("moving east increases east and leaves north at zero, scaled by cos(latitude)", () => {
    const { east, north } = localOffsetMeters(50.45, 30.521, 50.45, 30.52);
    // 0.001 deg longitude at 50.45N is ~111m * cos(50.45deg) =~ 70.7m, not the full 111m -
    // proves the cos(latitude) scaling is actually applied, not just a raw degree delta.
    expect(east).toBeCloseTo(70.7, 0);
    expect(north).toBeCloseTo(0, 6);
  });

  it("moving south/west gives negative north/east", () => {
    const { east, north } = localOffsetMeters(50.449, 30.519, 50.45, 30.52);
    expect(north).toBeLessThan(0);
    expect(east).toBeLessThan(0);
  });
});

describe("niceRadiusMeters", () => {
  it("picks the smallest round step that fits the farthest distance", () => {
    expect(niceRadiusMeters(0)).toBe(10);
    expect(niceRadiusMeters(9)).toBe(10);
    expect(niceRadiusMeters(11)).toBe(25);
    expect(niceRadiusMeters(240)).toBe(250);
    expect(niceRadiusMeters(1)).toBe(10);
  });

  it("falls back to the largest step for a distance beyond every fixed step", () => {
    expect(niceRadiusMeters(1_000_000)).toBe(50000);
  });
});
