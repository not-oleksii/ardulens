import type { ModeSegment } from "@/analysis/raw-log/raw-log";

export interface ModeLabelPlacement {
  segment: ModeSegment;
  xPx: number;
}

/** Minimum horizontal gap (px) between two mode labels' anchor points before one is dropped. */
const MIN_LABEL_GAP_PX = 46;

/**
 * Anchors each label to the CENTER of its segment's currently-visible portion (not its
 * start) and drops labels that would land too close to the previous one. A segment that's
 * only a couple of seconds wide next to its neighbors (e.g. a brief TAKEOFF between two
 * long modes) would otherwise get its start-anchored label crammed against those
 * neighbors' labels and become illegible, even though the segment itself is real.
 */
export function planModeLabels(
  modeSegments: ModeSegment[],
  toPx: (sec: number) => number,
  bboxLeft: number,
  bboxWidth: number,
  minGapPx = MIN_LABEL_GAP_PX,
): ModeLabelPlacement[] {
  const bboxRight = bboxLeft + bboxWidth;
  const candidates = modeSegments
    .map((segment) => {
      const x0 = toPx(segment.startMs / 1000);
      const x1 = toPx(segment.endMs / 1000);
      const visLeft = Math.max(x0, bboxLeft);
      const visRight = Math.min(x1, bboxRight);
      if (visRight <= visLeft) return null;
      return { segment, xPx: (visLeft + visRight) / 2 };
    })
    .filter((c): c is ModeLabelPlacement => c !== null)
    .sort((a, b) => a.xPx - b.xPx);

  const placed: ModeLabelPlacement[] = [];
  for (const c of candidates) {
    const prev = placed[placed.length - 1];
    if (prev && c.xPx - prev.xPx < minGapPx) continue;
    placed.push(c);
  }
  return placed;
}
