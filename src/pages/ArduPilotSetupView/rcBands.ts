// ArduPilot's fixed 6-way flight-mode-channel band boundaries (RC_Channel::read_6pos_switch) -
// the same breakpoints Mission Planner's own Flight Modes screen highlights against. Widely
// documented/stable across ArduPilot versions, not guessed.
export const FLTMODE_BAND_UPPER_BOUNDS = [1231, 1361, 1491, 1621, 1751] as const;

export const FLTMODE_BAND_RANGE_LABELS = ["<1231", "1231-1360", "1361-1490", "1491-1620", "1621-1750", "≥1751"] as const;

/** Which of the 6 FLTMODE slots (0-5) a given PWM value on the flight-mode channel selects. */
export function fltModeBandIndex(pwm: number): number {
  for (let i = 0; i < FLTMODE_BAND_UPPER_BOUNDS.length; i++) {
    if (pwm < FLTMODE_BAND_UPPER_BOUNDS[i]!) return i;
  }
  return FLTMODE_BAND_UPPER_BOUNDS.length;
}

export type AuxSwitchPos = "low" | "middle" | "high";

// ArduPilot's coarser 3-way aux-switch split (RC_Channel::AuxSwitchPos) - a different, wider
// breakpoint set than the 6-way flight-mode bands above, though both start from the same LOW
// boundary by convention.
export function auxSwitchPos(pwm: number): AuxSwitchPos {
  if (pwm < 1231) return "low";
  if (pwm >= 1750) return "high";
  return "middle";
}
