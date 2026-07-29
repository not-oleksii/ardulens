import type { ModeSegment, RawLogPoint } from "@/analysis/raw-log/raw-log";

export interface TimelineSeriesInput {
  key: string;
  label: string;
  color: string;
  data: RawLogPoint[];
}

export interface TimelineChartProps {
  series: TimelineSeriesInput[];
  modeSegments: ModeSegment[];
  timeRangeMs: [number, number];
}
