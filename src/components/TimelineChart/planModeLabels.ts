import type { ModeSegment } from "@/analysis/raw-log/raw-log";

export interface ModeLabelPlacement {
  segment: ModeSegment;
  xPx: number;
}

/** Minimum horizontal gap (px) between two mode labels' anchor points before one is dropped. */
const MIN_LABEL_GAP_PX = 46;

/**
 * Anchors each label to the START of its segment's currently-visible portion (clamped to
 * the viewport's left edge if the segment begins off-screen), so it reads at the beginning
 * of that mode's span rather than floating in the middle. Labels are placed in order of
 * visible width (widest/most significant segment first); a candidate is dropped only if
 * it would land within minGapPx of an already-placed label. Prioritizing by width (rather
 * than by left-to-right position) matters here: a segment that's only a couple of seconds
 * wide right next to a long dominant one (e.g. a brief TAKEOFF immediately before a
 * multi-minute FBWA) would otherwise "win" the left-to-right race and crowd out the long
 * segment's own label, even though the long segment is the one worth labeling.
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
      return { segment, xPx: visLeft, visibleWidth: visRight - visLeft };
    })
    .filter((c): c is ModeLabelPlacement & { visibleWidth: number } => c !== null)
    .sort((a, b) => b.visibleWidth - a.visibleWidth);

  const placed: ModeLabelPlacement[] = [];
  for (const c of candidates) {
    if (placed.some((p) => Math.abs(p.xPx - c.xPx) < minGapPx)) continue;
    placed.push({ segment: c.segment, xPx: c.xPx });
  }
  return placed.sort((a, b) => a.xPx - b.xPx);
}
