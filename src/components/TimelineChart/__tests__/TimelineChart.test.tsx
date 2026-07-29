import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
