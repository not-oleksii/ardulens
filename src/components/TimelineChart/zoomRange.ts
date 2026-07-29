export interface ZoomRangeInput {
  currentMin: number;
  currentMax: number;
  /** The data-space x-value under the cursor - stays fixed under the cursor as the range changes. */
  cursorVal: number;
  zoomIn: boolean;
  fullMin: number;
  fullMax: number;
  minRangeSec?: number;
}

const DEFAULT_MIN_RANGE_SEC = 1;
const ZOOM_STEP = 0.85;

/** Computes the new [min, max] x-scale window for one scroll-wheel step, keeping
 *  cursorVal fixed under the cursor and clamping to [fullMin, fullMax] and to a minimum
 *  visible range so the window can never collapse to nothing or overshoot the data. */
export function computeZoomedRange({
  currentMin,
  currentMax,
  cursorVal,
  zoomIn,
  fullMin,
  fullMax,
  minRangeSec = DEFAULT_MIN_RANGE_SEC,
}: ZoomRangeInput): { min: number; max: number } {
  const range = currentMax - currentMin;
  const zoomFactor = zoomIn ? ZOOM_STEP : 1 / ZOOM_STEP;
  const newRange = Math.min(fullMax - fullMin, Math.max(minRangeSec, range * zoomFactor));
  const ratio = range === 0 ? 0.5 : (cursorVal - currentMin) / range;

  let newMin = cursorVal - ratio * newRange;
  let newMax = newMin + newRange;
  if (newMin < fullMin) {
    newMax += fullMin - newMin;
    newMin = fullMin;
  }
  if (newMax > fullMax) {
    newMin -= newMax - fullMax;
    newMax = fullMax;
  }
  return { min: Math.max(fullMin, newMin), max: Math.min(fullMax, newMax) };
}
