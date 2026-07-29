import { describe, expect, it } from "vitest";
import { computeZoomedRange } from "../zoomRange";

describe("computeZoomedRange", () => {
  it("narrows the range by the zoom-in factor, keeping the cursor value fixed", () => {
    const { min, max } = computeZoomedRange({
      currentMin: 0,
      currentMax: 300,
      cursorVal: 150, // dead center
      zoomIn: true,
      fullMin: 0,
      fullMax: 300,
    });

    expect(max - min).toBeCloseTo(255, 5); // 300 * 0.85
    expect((min + max) / 2).toBeCloseTo(150, 5); // cursor stayed centered since it was already centered
  });

  it("widens the range by the zoom-out factor", () => {
    const { min, max } = computeZoomedRange({
      currentMin: 100,
      currentMax: 200,
      cursorVal: 150,
      zoomIn: false,
      fullMin: 0,
      fullMax: 300,
    });

    expect(max - min).toBeCloseTo(100 / 0.85, 5);
  });

  it("keeps the cursor's data value fixed under the cursor, even off-center", () => {
    const { min, max } = computeZoomedRange({
      currentMin: 0,
      currentMax: 300,
      cursorVal: 270, // near the right edge
      zoomIn: true,
      fullMin: 0,
      fullMax: 300,
    });
    const newRange = max - min;
    const ratioBefore = 270 / 300;
    const ratioAfter = (270 - min) / newRange;
    expect(ratioAfter).toBeCloseTo(ratioBefore, 5);
  });

  it("clamps zoom-out to the full data range instead of overshooting it", () => {
    const { min, max } = computeZoomedRange({
      currentMin: 10,
      currentMax: 290,
      cursorVal: 150,
      zoomIn: false,
      fullMin: 0,
      fullMax: 300,
    });

    expect(min).toBe(0);
    expect(max).toBe(300);
  });

  it("is a no-op when already at the full range and zooming out further", () => {
    const { min, max } = computeZoomedRange({
      currentMin: 0,
      currentMax: 300,
      cursorVal: 150,
      zoomIn: false,
      fullMin: 0,
      fullMax: 300,
    });

    expect(min).toBe(0);
    expect(max).toBe(300);
  });

  it("clamps zoom-in to a minimum visible range instead of collapsing to zero width", () => {
    const { min, max } = computeZoomedRange({
      currentMin: 149.5,
      currentMax: 150.5, // already a 1s window - one more zoom-in step would go below the floor
      cursorVal: 150,
      zoomIn: true,
      fullMin: 0,
      fullMax: 300,
      minRangeSec: 1,
    });

    expect(max - min).toBeCloseTo(1, 5);
  });

  it("shifts the window rather than clipping it when zooming out would push past the left edge", () => {
    const { min, max } = computeZoomedRange({
      currentMin: 0,
      currentMax: 50,
      cursorVal: 5, // cursor near the already-clamped left edge
      zoomIn: false,
      fullMin: 0,
      fullMax: 300,
    });

    // Range should widen by 1/0.85, but since it can't extend left of 0 it must
    // extend further right instead - min stays pinned at the data boundary.
    expect(min).toBe(0);
    expect(max).toBeCloseTo(50 / 0.85, 5);
  });

  it("shifts the window rather than clipping it when zooming out would push past the right edge", () => {
    const { min, max } = computeZoomedRange({
      currentMin: 250,
      currentMax: 300,
      cursorVal: 295, // cursor near the already-clamped right edge
      zoomIn: false,
      fullMin: 0,
      fullMax: 300,
    });

    expect(max).toBe(300);
    expect(min).toBeCloseTo(300 - 50 / 0.85, 5);
  });

  it("handles a zero-width current range without dividing by zero", () => {
    const { min, max } = computeZoomedRange({
      currentMin: 150,
      currentMax: 150,
      cursorVal: 150,
      zoomIn: false,
      fullMin: 0,
      fullMax: 300,
    });

    expect(Number.isFinite(min)).toBe(true);
    expect(Number.isFinite(max)).toBe(true);
    expect(max).toBeGreaterThan(min);
  });
});
