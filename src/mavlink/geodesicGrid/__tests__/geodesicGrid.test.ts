import { describe, expect, it } from "vitest";
import { GEODESIC_SECTIONS, isCompletionMaskSectionSet, type Vec3 } from "../geodesicGrid";

function length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function expectVec3CloseTo(actual: Vec3, expected: Vec3, precision = 5) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.z).toBeCloseTo(expected.z, precision);
}

describe("GEODESIC_SECTIONS", () => {
  it("has exactly 80 sections (20 icosahedron triangles x 4 sub-triangles)", () => {
    expect(GEODESIC_SECTIONS).toHaveLength(80);
  });

  it("every vertex of every section sits on the unit sphere", () => {
    for (const triangle of GEODESIC_SECTIONS) {
      for (const vertex of triangle) {
        expect(length(vertex)).toBeCloseTo(1, 9);
      }
    }
  });

  it("section 0 (T_0's middle sub-triangle) matches an independently computed reference", () => {
    // T_0 = ((-g,1,0), (-1,0,-g), (-g,-1,0)); section 0 = W_0 = the middle triangle formed by
    // the (normalized) edge midpoints of T_0's (already-normalized) vertices. Values below were
    // computed independently (plain JS arithmetic, not by importing this module's own code).
    const [w0a, w0b, w0c] = GEODESIC_SECTIONS[0]!;
    expectVec3CloseTo(w0a, { x: -0.8090169943749473, y: 0.3090169943749474, z: -0.5 });
    expectVec3CloseTo(w0b, { x: -0.8090169943749473, y: -0.3090169943749474, z: -0.5 });
    expectVec3CloseTo(w0c, { x: -1, y: 0, z: 0 });
  });

  it("T_10's sections are the exact antipodal reflection of T_0's (T_(i+10) = -T_i)", () => {
    // Section 40 is T_10's own W_0 (index 4*10 + 0) - since T_10 = -T_0, and normalizing a
    // negated vector just negates the normalized result, section 40 must be section 0 negated.
    const t0w0 = GEODESIC_SECTIONS[0]!;
    const t10w0 = GEODESIC_SECTIONS[40]!;
    for (let i = 0; i < 3; i++) {
      expectVec3CloseTo(t10w0[i]!, { x: -t0w0[i]!.x, y: -t0w0[i]!.y, z: -t0w0[i]!.z });
    }
  });
});

describe("isCompletionMaskSectionSet", () => {
  it("reads the correct bit for a section within the first byte", () => {
    const mask = [0b0000_0101, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(isCompletionMaskSectionSet(mask, 0)).toBe(true);
    expect(isCompletionMaskSectionSet(mask, 1)).toBe(false);
    expect(isCompletionMaskSectionSet(mask, 2)).toBe(true);
    expect(isCompletionMaskSectionSet(mask, 3)).toBe(false);
  });

  it("reads bits from the correct byte for sections beyond the first 8", () => {
    const mask = [0, 0, 0b0000_0001, 0, 0, 0, 0, 0, 0, 0];
    expect(isCompletionMaskSectionSet(mask, 16)).toBe(true);
    expect(isCompletionMaskSectionSet(mask, 17)).toBe(false);
  });

  it("treats a missing byte as unset rather than throwing", () => {
    expect(isCompletionMaskSectionSet([], 79)).toBe(false);
  });
});
