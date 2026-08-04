import { describe, expect, it } from "vitest";
import { buildHeadingTapeTicks, buildPitchLadderRungs, buildRollScaleTicks, buildTapeTicks, radToDeg } from "../pfdMath";

describe("buildTapeTicks", () => {
  it("generates evenly spaced ticks around the center value", () => {
    const ticks = buildTapeTicks(50, 20, 10, 2);
    expect(ticks.map((t) => t.value)).toEqual([30, 40, 50, 60, 70]);
  });

  it("places the center value's tick at offset 0", () => {
    const ticks = buildTapeTicks(50, 20, 10, 2);
    const center = ticks.find((t) => t.value === 50);
    expect(center?.offsetPx).toBe(0);
  });

  it("scales offsets by pxPerUnit and direction (below-center values are positive)", () => {
    const ticks = buildTapeTicks(50, 20, 10, 3);
    const above = ticks.find((t) => t.value === 40)!;
    const below = ticks.find((t) => t.value === 60)!;
    expect(above.offsetPx).toBe(-30);
    expect(below.offsetPx).toBe(30);
  });

  it("handles a non-round center value by snapping the first tick to the step grid", () => {
    const ticks = buildTapeTicks(53, 15, 10, 1);
    expect(ticks.map((t) => t.value)).toEqual([40, 50, 60]);
  });
});

describe("buildHeadingTapeTicks", () => {
  it("generates ticks around a mid-range heading without wrapping", () => {
    const ticks = buildHeadingTapeTicks(180, 20, 10, 2);
    expect(ticks.map((t) => t.value)).toEqual([160, 170, 180, 190, 200]);
  });

  it("wraps ticks past 360 back to 0", () => {
    const ticks = buildHeadingTapeTicks(350, 20, 10, 2);
    expect(ticks.map((t) => t.value)).toEqual([330, 340, 350, 0, 10]);
  });

  it("wraps ticks below 0 back to 350+", () => {
    const ticks = buildHeadingTapeTicks(5, 20, 10, 2);
    expect(ticks.map((t) => t.value)).toEqual([350, 0, 10, 20]);
  });

  it("keeps offsetPx continuous (unwrapped) even when the value itself wraps", () => {
    const ticks = buildHeadingTapeTicks(350, 20, 10, 2);
    const wrapped = ticks.find((t) => t.value === 0)!;
    expect(wrapped.offsetPx).toBe(20); // 360 - 350 = 10 deg past center, * 2px/deg
  });
});

describe("buildPitchLadderRungs", () => {
  it("builds rungs for +/-10/20/30 degrees, not 0", () => {
    const rungs = buildPitchLadderRungs(5);
    expect(rungs.map((r) => r.angleDeg).sort((a, b) => a - b)).toEqual([-30, -20, -10, 10, 20, 30]);
  });

  it("positions positive-pitch rungs above center (negative local y)", () => {
    const rungs = buildPitchLadderRungs(5);
    const plus10 = rungs.find((r) => r.angleDeg === 10)!;
    const minus10 = rungs.find((r) => r.angleDeg === -10)!;
    expect(plus10.localY).toBe(-50);
    expect(minus10.localY).toBe(50);
  });

  it("gives wider rungs to larger pitch angles", () => {
    const rungs = buildPitchLadderRungs(5);
    const at = (deg: number) => rungs.find((r) => r.angleDeg === deg)!.halfWidthPx;
    expect(at(10)).toBeLessThan(at(20));
    expect(at(20)).toBeLessThan(at(30));
  });
});

describe("buildRollScaleTicks", () => {
  it("places the 0-degree tick directly above the center", () => {
    const ticks = buildRollScaleTicks(100, 100, 50);
    const zero = ticks.find((t) => t.angleDeg === 0)!;
    expect(zero.x).toBeCloseTo(100);
    expect(zero.y).toBeCloseTo(50);
  });

  it("places positive-angle ticks to the right of center", () => {
    const ticks = buildRollScaleTicks(100, 100, 50);
    const plus30 = ticks.find((t) => t.angleDeg === 30)!;
    expect(plus30.x).toBeGreaterThan(100);
  });

  it("places negative-angle ticks to the left of center", () => {
    const ticks = buildRollScaleTicks(100, 100, 50);
    const minus30 = ticks.find((t) => t.angleDeg === -30)!;
    expect(minus30.x).toBeLessThan(100);
  });
});

describe("radToDeg", () => {
  it("converts pi/2 radians to 90 degrees", () => {
    expect(radToDeg(Math.PI / 2)).toBeCloseTo(90);
  });

  it("converts negative radians correctly", () => {
    expect(radToDeg(-Math.PI)).toBeCloseTo(-180);
  });
});
