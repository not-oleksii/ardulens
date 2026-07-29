import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ModeSegment } from "@/analysis/raw-log/raw-log";
import { planModeLabels } from "./planModeLabels";
import type { TimelineChartProps, TimelineSeriesInput } from "./types";
import { computeZoomedRange } from "./zoomRange";

// Light/pastel so bands read as a gentle wash rather than a dark overlay, and distinct
// enough from each other that adjacent modes never look like the same color.
const MODE_BAND_COLORS = [
  "#fca5a5", // red
  "#fdba74", // orange
  "#fde047", // yellow
  "#86efac", // green
  "#93c5fd", // blue
  "#d8b4fe", // purple
  "#f9a8d4", // pink
  "#cbd5e1", // slate
];

/**
 * Assigns each DISTINCT mode number present in this chart its own color, in first-seen
 * order - rather than hashing the raw mode number (mode % colors.length), which could
 * (and did) put two different modes that both happen to appear in the same flight on the
 * same color purely by coincidence (e.g. FBWA=5 and TAKEOFF=13 both landing on the same
 * bucket mod 8).
 */
function buildModeColorMap(modeSegments: ModeSegment[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const seg of modeSegments) {
    if (!map.has(seg.mode)) map.set(seg.mode, MODE_BAND_COLORS[map.size % MODE_BAND_COLORS.length]!);
  }
  return map;
}

function toAlignedData(series: TimelineSeriesInput[]): uPlot.AlignedData {
  const tables = series.map((s): uPlot.AlignedData => {
    const t = s.data.map((p) => p.t / 1000);
    const v = s.data.map((p) => p.v);
    return [t, v];
  });
  return uPlot.join(tables);
}

function formatSeconds(sec: number): string {
  const sign = sec < 0 ? "-" : "";
  const abs = Math.abs(sec);
  const m = Math.floor(abs / 60);
  const s = Math.floor(abs % 60);
  return `${sign}${m}:${String(s).padStart(2, "0")}`;
}

function drawModeBands(modeSegments: ModeSegment[], colorMap: Map<number, string>) {
  return (u: uPlot) => {
    const ctx = u.ctx;
    ctx.save();
    for (const seg of modeSegments) {
      const x0 = u.valToPos(seg.startMs / 1000, "x", true);
      const x1 = u.valToPos(seg.endMs / 1000, "x", true);
      if (x1 <= u.bbox.left || x0 >= u.bbox.left + u.bbox.width) continue;
      ctx.fillStyle = `${colorMap.get(seg.mode)}55`;
      ctx.fillRect(x0, u.bbox.top, Math.max(1, x1 - x0), u.bbox.height);
    }
    ctx.restore();
  };
}

/**
 * Picks black or white text for a given hex background so it's always readable against
 * it - computed from the color itself (perceived luminance), never from the page theme.
 * A CSS-variable-based text color previously looked fine in isolation but still read as
 * "dark on dark" once combined with a dark-themed chart background in practice.
 */
function contrastingTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000000" : "#ffffff";
}

function drawModeLabels(modeSegments: ModeSegment[], colorMap: Map<number, string>) {
  return (u: uPlot) => {
    const ctx = u.ctx;
    const placements = planModeLabels(modeSegments, (sec) => u.valToPos(sec, "x", true), u.bbox.left, u.bbox.width);

    ctx.save();
    ctx.font = "bold 11px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (const { segment, xPx } of placements) {
      const chipColor = colorMap.get(segment.mode) ?? "#cbd5e1";
      const textColor = contrastingTextColor(chipColor);
      const textWidth = ctx.measureText(segment.label).width;
      ctx.save();
      ctx.translate(xPx, u.bbox.top + u.bbox.height - 6);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = chipColor;
      ctx.fillRect(-3, -8, textWidth + 6, 16);
      ctx.fillStyle = textColor;
      ctx.fillText(segment.label, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  };
}

const AXIS_TEXT_COLOR = "#9ca3af"; // neutral grey, readable against both light and dark themes
const ZOOM_MIN_RANGE_SEC = 1; // don't let scroll-zoom collapse the visible window to nothing

function buildOptions(series: TimelineSeriesInput[], modeSegments: ModeSegment[], width: number): uPlot.Options {
  const colorMap = buildModeColorMap(modeSegments);
  return {
    width,
    height: 320,
    scales: { x: { time: false } },
    cursor: { drag: { x: true, y: false, setScale: true } },
    axes: [
      { values: (_u, vals) => vals.map(formatSeconds), stroke: AXIS_TEXT_COLOR },
      { stroke: AXIS_TEXT_COLOR },
    ],
    series: [
      {},
      ...series.map((s) => ({ label: s.label, stroke: s.color, width: 1.5, points: { show: false } })),
    ],
    hooks: {
      drawClear: [drawModeBands(modeSegments, colorMap)],
      draw: [drawModeLabels(modeSegments, colorMap)],
    },
  };
}

export function TimelineChart({ series, modeSegments, timeRangeMs }: TimelineChartProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || series.length === 0) return;

    const data = toAlignedData(series);
    const opts = buildOptions(series, modeSegments, el.clientWidth || 800);
    const plot = new uPlot(opts, data, el);

    const fullMin = timeRangeMs[0] / 1000;
    const fullMax = timeRangeMs[1] / 1000;

    const resetZoom = () => plot.setScale("x", { min: fullMin, max: fullMax });
    el.addEventListener("dblclick", resetZoom);

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      // plot.over (not the outer container) is aligned with the actual plotting area -
      // the container also includes the y-axis label gutter, which would otherwise throw
      // off where the cursor lands on the x scale.
      const cursorPx = e.clientX - plot.over.getBoundingClientRect().left;
      const cursorVal = plot.posToVal(cursorPx, "x");
      const { min = fullMin, max = fullMax } = plot.scales.x ?? {};
      const { min: newMin, max: newMax } = computeZoomedRange({
        currentMin: min,
        currentMax: max,
        cursorVal,
        zoomIn: e.deltaY < 0,
        fullMin,
        fullMax,
        minRangeSec: ZOOM_MIN_RANGE_SEC,
      });
      plot.setScale("x", { min: newMin, max: newMax });
    };
    el.addEventListener("wheel", handleWheel, { passive: false });

    const resizeObserver = new ResizeObserver(() => {
      if (el.clientWidth > 0) plot.setSize({ width: el.clientWidth, height: 320 });
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      el.removeEventListener("dblclick", resetZoom);
      el.removeEventListener("wheel", handleWheel);
      plot.destroy();
    };
  }, [series, modeSegments, timeRangeMs]);

  if (series.length === 0) {
    return (
      <div
        data-testid="timeline-chart-empty"
        className="flex h-80 items-center justify-center rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground"
      >
        {t("graphs.chart.empty")}
      </div>
    );
  }

  return <div ref={containerRef} data-testid="timeline-chart" title={t("graphs.chart.zoomHint")} />;
}
