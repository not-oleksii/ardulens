import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { planModeLabels } from "../planModeLabels";
import { TimelineChart } from "../TimelineChart";

const { MockUplot, destroy } = vi.hoisted(() => {
  const destroy = vi.fn();
  const setScale = vi.fn();
  const setSize = vi.fn();
  const MockUplot = vi.fn().mockImplementation(function mockUplotCtor(
    this: Record<string, unknown>,
    opts: unknown,
    data: unknown,
  ) {
    this["opts"] = opts;
    this["data"] = data;
    this["destroy"] = destroy;
    this["setScale"] = setScale;
    this["setSize"] = setSize;
  });
  (MockUplot as unknown as { join: (tables: unknown[][]) => unknown }).join = vi.fn((tables: unknown[][]) => [
    "x",
    ...tables.map((t) => t[1]),
  ]);
  return { MockUplot, destroy, setScale, setSize };
});

vi.mock("uplot", () => ({ default: MockUplot }));

const modeSegments = [{ startMs: 0, endMs: 1000, mode: 5, label: "FBWA" }];

describe("TimelineChart", () => {
  afterEach(() => {
    MockUplot.mockClear();
    destroy.mockClear();
  });

  it("shows an empty-state placeholder and never touches uPlot when no series are selected", () => {
    render(<TimelineChart series={[]} modeSegments={[]} timeRangeMs={[0, 0]} />);

    expect(screen.getByTestId("timeline-chart-empty")).toBeInTheDocument();
    expect(MockUplot).not.toHaveBeenCalled();
  });

  it("joins the selected series into aligned data and instantiates uPlot with one series config per param", () => {
    const series = [
      { key: "BAT.Volt", label: "BAT.Volt", color: "#ff0000", data: [{ t: 0, v: 25.1 }, { t: 100, v: 25.0 }] },
      { key: "ARSP.Airspeed", label: "ARSP.Airspeed", color: "#00ff00", data: [{ t: 0, v: 12 }] },
    ];

    render(<TimelineChart series={series} modeSegments={modeSegments} timeRangeMs={[0, 100]} />);

    expect(MockUplot).toHaveBeenCalledTimes(1);
    const [opts] = MockUplot.mock.calls[0] as [{ series: Array<{ label?: string }> }, unknown];
    expect(opts.series).toHaveLength(3); // x + 2 selected params
    expect(opts.series[1]!.label).toBe("BAT.Volt");
    expect(opts.series[2]!.label).toBe("ARSP.Airspeed");
  });

  it("destroys the uPlot instance on unmount", () => {
    const series = [{ key: "BAT.Volt", label: "BAT.Volt", color: "#ff0000", data: [{ t: 0, v: 25.1 }] }];
    const { unmount } = render(<TimelineChart series={series} modeSegments={[]} timeRangeMs={[0, 100]} />);
    destroy.mockClear(); // isolate from any leftover instance destroyed by a previous test's cleanup

    unmount();

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe("planModeLabels", () => {
  it("anchors a placed label at the START of its own segment, not its center", () => {
    const segments = [
      { startMs: 0, endMs: 100_000, mode: 0, label: "MANUAL" },
      { startMs: 100_000, endMs: 600_000, mode: 5, label: "FBWA" },
    ];
    const toPx = (sec: number) => sec; // 1px/s

    const placements = planModeLabels(segments, toPx, 0, 900);

    expect(placements.find((p) => p.segment.label === "MANUAL")!.xPx).toBe(0);
    // FBWA spans 100-600s; its center would be ~350, but it must be anchored at its own
    // start (100), not the midpoint of its visible span.
    expect(placements.find((p) => p.segment.label === "FBWA")!.xPx).toBe(100);
  });

  it("prioritizes the widest (most significant) segment when a narrow neighbor sits right at its start", () => {
    // A brief mode sitting exactly at a long segment's start would, under naive left-to-right
    // placement, "win" the spot and crowd out the long segment's own label. Placement must
    // prioritize by visible width so the long segment keeps its label instead.
    const segments = [
      { startMs: 0, endMs: 2_000, mode: 0, label: "BRIEF" },
      { startMs: 2_000, endMs: 500_000, mode: 5, label: "LONG" },
    ];
    const toPx = (sec: number) => sec * 2; // BRIEF and LONG start only 4px apart

    const placements = planModeLabels(segments, toPx, 0, 1000, 46);

    expect(placements.map((p) => p.segment.label)).toEqual(["LONG"]);
  });

  it("keeps every label when segments are spread out with room to spare", () => {
    const segments = [
      { startMs: 0, endMs: 10_000, mode: 0, label: "MANUAL" },
      { startMs: 10_000, endMs: 20_000, mode: 5, label: "FBWA" },
      { startMs: 20_000, endMs: 30_000, mode: 15, label: "GUIDED" },
    ];
    const toPx = (sec: number) => sec * 30; // 30px/s -> segments 150px apart at their centers

    const placements = planModeLabels(segments, toPx, 0, 900);

    expect(placements.map((p) => p.segment.label)).toEqual(["MANUAL", "FBWA", "GUIDED"]);
  });

  it("reproduces a real flight's mode timeline: a brief TAKEOFF squeezed between GUIDED and a long FBWA doesn't crowd out FBWA's own label", () => {
    // Mirrors an actual ArduPlane .bin: GUIDED(1.2-5s) -> TAKEOFF(5-7.6s) -> FBWA(7.6-1124.3s)
    // -> GUIDED(1124.3-1363.1s) -> ACRO(1363.1-1363.8s) -> FBWA(1363.8-1434.6s), over a ~900px chart.
    const segments = [
      { startMs: 1_200, endMs: 5_000, mode: 15, label: "GUIDED" },
      { startMs: 5_000, endMs: 7_600, mode: 13, label: "TAKEOFF" },
      { startMs: 7_600, endMs: 1_124_300, mode: 5, label: "FBWA" },
      { startMs: 1_124_300, endMs: 1_363_100, mode: 15, label: "GUIDED" },
      { startMs: 1_363_100, endMs: 1_363_800, mode: 4, label: "ACRO" },
      { startMs: 1_363_800, endMs: 1_434_600, mode: 5, label: "FBWA" },
    ];
    const totalMs = 1_434_600;
    const chartWidthPx = 900;
    const toPx = (sec: number) => (sec / (totalMs / 1000)) * chartWidthPx;

    const placements = planModeLabels(segments, toPx, 0, chartWidthPx);
    const labels = placements.map((p) => p.segment.label);

    // FBWA (77.8% of the timeline) and the second GUIDED (16.6%) are the dominant
    // modes and must always get a readable label, regardless of what's dropped nearby.
    expect(labels).toContain("FBWA");
    expect(labels.filter((l) => l === "GUIDED")).toContain("GUIDED");
    // No two labels are placed closer than the minimum gap.
    for (let i = 1; i < placements.length; i++) {
      expect(placements[i]!.xPx - placements[i - 1]!.xPx).toBeGreaterThanOrEqual(46);
    }
  });

  it("drops labels for segments that are entirely scrolled out of the visible range", () => {
    const segments = [
      { startMs: 0, endMs: 1_000_000, mode: 0, label: "OFFSCREEN_LEFT" },
      { startMs: 5_000_000, endMs: 6_000_000, mode: 5, label: "VISIBLE" },
      { startMs: 100_000_000, endMs: 101_000_000, mode: 15, label: "OFFSCREEN_RIGHT" },
    ];
    const toPx = (sec: number) => sec; // 1px/s, visible window is [4000, 7000]px (seconds 4000-7000)

    const placements = planModeLabels(segments, toPx, 4000, 3000);

    expect(placements.map((p) => p.segment.label)).toEqual(["VISIBLE"]);
  });

  it("returns an empty array for an empty segment list", () => {
    expect(planModeLabels([], (sec) => sec, 0, 900)).toEqual([]);
  });

  it("returns an empty array when every segment is entirely off-screen", () => {
    const segments = [
      { startMs: 0, endMs: 1000, mode: 0, label: "LEFT" },
      { startMs: 2_000_000, endMs: 2_001_000, mode: 5, label: "RIGHT" },
    ];
    const toPx = (sec: number) => sec;

    expect(planModeLabels(segments, toPx, 5000, 1000)).toEqual([]);
  });

  it("keeps a single segment that exactly fills the visible range", () => {
    const segments = [{ startMs: 0, endMs: 300_000, mode: 5, label: "FBWA" }];
    const toPx = (sec: number) => sec * 3;

    const placements = planModeLabels(segments, toPx, 0, 900);

    expect(placements).toHaveLength(1);
    expect(placements[0]!.xPx).toBe(0);
  });

  it("breaks a tie in visible width by keeping array order (stable sort)", () => {
    const segments = [
      { startMs: 0, endMs: 10_000, mode: 0, label: "FIRST" },
      { startMs: 200_000, endMs: 210_000, mode: 5, label: "SECOND" },
    ];
    const toPx = (sec: number) => sec; // both segments are exactly 10px wide -> a genuine tie

    const placements = planModeLabels(segments, toPx, 0, 900);

    // Both are far enough apart (190px) that neither is dropped for proximity - this just
    // confirms a width tie doesn't throw or silently drop one of them.
    expect(placements.map((p) => p.segment.label)).toEqual(["FIRST", "SECOND"]);
  });
});
