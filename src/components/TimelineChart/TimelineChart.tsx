import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ModeSegment } from "@/analysis/raw-log/raw-log";
import { planModeLabels } from "./planModeLabels";
import type { TimelineChartProps, TimelineSeriesInput } from "./types";

const MODE_BAND_COLORS = ["#e5484d", "#f76b15", "#ffd60a", "#30a46c", "#3b82f6", "#a855f7", "#ec4899", "#64748b"];

function modeColor(mode: number): string {
  return MODE_BAND_COLORS[((mode % MODE_BAND_COLORS.length) + MODE_BAND_COLORS.length) % MODE_BAND_COLORS.length]!;
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

function drawModeBands(modeSegments: ModeSegment[]) {
  return (u: uPlot) => {
    const ctx = u.ctx;
    ctx.save();
    for (const seg of modeSegments) {
      const x0 = u.valToPos(seg.startMs / 1000, "x", true);
      const x1 = u.valToPos(seg.endMs / 1000, "x", true);
      if (x1 <= u.bbox.left || x0 >= u.bbox.left + u.bbox.width) continue;
      ctx.fillStyle = `${modeColor(seg.mode)}22`;
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

function drawModeLabels(modeSegments: ModeSegment[]) {
  return (u: uPlot) => {
    const ctx = u.ctx;
    const placements = planModeLabels(modeSegments, (sec) => u.valToPos(sec, "x", true), u.bbox.left, u.bbox.width);

    ctx.save();
    ctx.font = "bold 11px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (const { segment, xPx } of placements) {
      const chipColor = modeColor(segment.mode);
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

function buildOptions(series: TimelineSeriesInput[], modeSegments: ModeSegment[], width: number): uPlot.Options {
  return {
    width,
    height: 320,
    scales: { x: { time: false } },
    cursor: { drag: { x: true, y: false, setScale: true } },
    axes: [
      { values: (_u, vals) => vals.map(formatSeconds) },
      {},
    ],
    series: [
      {},
      ...series.map((s) => ({ label: s.label, stroke: s.color, width: 1.5, points: { show: false } })),
    ],
    hooks: {
      drawClear: [drawModeBands(modeSegments)],
      draw: [drawModeLabels(modeSegments)],
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

    const resetZoom = () => plot.setScale("x", { min: timeRangeMs[0] / 1000, max: timeRangeMs[1] / 1000 });
    el.addEventListener("dblclick", resetZoom);

    const resizeObserver = new ResizeObserver(() => {
      if (el.clientWidth > 0) plot.setSize({ width: el.clientWidth, height: 320 });
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      el.removeEventListener("dblclick", resetZoom);
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
