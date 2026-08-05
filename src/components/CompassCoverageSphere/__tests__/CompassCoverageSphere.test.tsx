import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompassCoverageSphere } from "../CompassCoverageSphere";

describe("CompassCoverageSphere", () => {
  it("renders an accessible svg labeled with the rounded completion percentage", () => {
    render(<CompassCoverageSphere completionMask={new Array(10).fill(0)} completionPct={41.7} />);
    expect(screen.getByRole("img", { name: "42%" })).toBeInTheDocument();
  });

  it("renders exactly 80 geodesic-section polygons", () => {
    const { container } = render(<CompassCoverageSphere completionMask={new Array(10).fill(0)} completionPct={0} />);
    expect(container.querySelectorAll("polygon")).toHaveLength(80);
  });

  it("colors a covered section differently from uncovered ones", () => {
    const { container } = render(<CompassCoverageSphere completionMask={[0b0000_0001, 0, 0, 0, 0, 0, 0, 0, 0, 0]} completionPct={1} />);
    const polygons = Array.from(container.querySelectorAll("polygon"));
    const fills = new Set(polygons.map((p) => p.getAttribute("fill")));
    // With only one of 80 sections covered, both a covered and an uncovered fill must appear.
    expect(fills.size).toBe(2);
  });
});
