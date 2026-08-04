export interface TapeTick {
  /** The tick's real value (already wrapped to [0, 360) for heading ticks). */
  value: number;
  /** Pixel offset from the tape's center - negative is above/left of center, positive below/right. */
  offsetPx: number;
}

/**
 * Evenly spaced tick values around a center value, for a vertical (airspeed/altitude) tape
 * that scrolls so the current value always sits at the center.
 */
export function buildTapeTicks(centerValue: number, halfSpan: number, step: number, pxPerUnit: number): TapeTick[] {
  const start = Math.ceil((centerValue - halfSpan) / step) * step;
  const ticks: TapeTick[] = [];
  for (let v = start; v <= centerValue + halfSpan + 1e-9; v += step) {
    ticks.push({ value: Math.round(v / step) * step, offsetPx: (v - centerValue) * pxPerUnit });
  }
  return ticks;
}

/** Same idea, but wraps values into [0, 360) for a compass heading tape. */
export function buildHeadingTapeTicks(centerHeadingDeg: number, halfSpanDeg: number, stepDeg: number, pxPerDeg: number): TapeTick[] {
  const start = Math.ceil((centerHeadingDeg - halfSpanDeg) / stepDeg) * stepDeg;
  const ticks: TapeTick[] = [];
  for (let v = start; v <= centerHeadingDeg + halfSpanDeg + 1e-9; v += stepDeg) {
    const rounded = Math.round(v / stepDeg) * stepDeg;
    const wrapped = ((rounded % 360) + 360) % 360;
    ticks.push({ value: wrapped, offsetPx: (v - centerHeadingDeg) * pxPerDeg });
  }
  return ticks;
}

export interface PitchRung {
  /** The rung's pitch value in degrees, e.g. 10, 20, -10 (0 is the horizon line itself, not a rung). */
  angleDeg: number;
  /** Vertical position in the ladder's own local frame, before the current-pitch translate + roll rotate. */
  localY: number;
  /** Rung line half-length in px - longer for the bigger pitch angles, matching real ADI ladders. */
  halfWidthPx: number;
}

const PITCH_RUNG_ANGLES = [-30, -20, -10, 10, 20, 30];

/** Fixed set of pitch-ladder rungs in local (unrotated, untranslated) coordinates. */
export function buildPitchLadderRungs(pxPerDeg: number): PitchRung[] {
  return PITCH_RUNG_ANGLES.map((angleDeg) => ({
    angleDeg,
    // Rungs above the horizon (positive pitch value) sit above center (negative SVG y).
    localY: -angleDeg * pxPerDeg,
    halfWidthPx: Math.abs(angleDeg) === 10 ? 18 : Math.abs(angleDeg) === 20 ? 28 : 38,
  }));
}

export interface RollScaleTick {
  angleDeg: number;
  x: number;
  y: number;
}

const ROLL_SCALE_ANGLES = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];

/** Fixed roll-scale tick positions on an arc of the given radius, centered at (cx, cy). */
export function buildRollScaleTicks(cx: number, cy: number, radius: number): RollScaleTick[] {
  return ROLL_SCALE_ANGLES.map((angleDeg) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { angleDeg, x: cx + radius * Math.sin(rad), y: cy - radius * Math.cos(rad) };
  });
}

/** Converts MAVLink radians (aerospace convention) to whole degrees for display. */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
