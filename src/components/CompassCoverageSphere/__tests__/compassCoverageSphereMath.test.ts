import { describe, expect, it } from "vitest";
import { GEODESIC_SECTIONS } from "../../../mavlink/geodesicGrid/geodesicGrid";
import { projectCoverageSphere } from "../compassCoverageSphereMath";

const EMPTY_MASK = new Array(10).fill(0);

describe("projectCoverageSphere", () => {
  it("returns exactly 80 sections", () => {
    expect(projectCoverageSphere(EMPTY_MASK, 0, 0, 100)).toHaveLength(80);
  });

  it("at zero rotation, projects a section's raw x/y scaled by radius with y flipped for SVG", () => {
    const [section0] = projectCoverageSphere(EMPTY_MASK, 0, 0, 100).filter((s) => s.section === 0);
    const raw = GEODESIC_SECTIONS[0]!;
    for (let i = 0; i < 3; i++) {
      expect(section0!.points[i]![0]).toBeCloseTo(raw[i]!.x * 100, 5);
      expect(section0!.points[i]![1]).toBeCloseTo(-raw[i]!.y * 100, 5);
    }
  });

  it("orders sections back-to-front (ascending depth) for correct painter's-algorithm occlusion", () => {
    const sections = projectCoverageSphere(EMPTY_MASK, 37, -12, 100);
    for (let i = 1; i < sections.length; i++) {
      expect(sections[i]!.depth).toBeGreaterThanOrEqual(sections[i - 1]!.depth);
    }
  });

  it("marks a section covered when its completion_mask bit is set", () => {
    const mask = [0b0000_0001, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // bit 0 -> section 0
    const sections = projectCoverageSphere(mask, 0, 0, 100);
    const section0 = sections.find((s) => s.section === 0);
    const section1 = sections.find((s) => s.section === 1);
    expect(section0?.covered).toBe(true);
    expect(section1?.covered).toBe(false);
  });
});
