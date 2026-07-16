export const AIR_MODES: ReadonlySet<number> = new Set([4, 5, 15]); // ACRO, FBWA, GUIDED
export const AIRBORNE_SPEED = 10; // m/s -> considered flying
export const MAX_FROM_CENTER = 300_000; // 300 km -> reject cross-country teleports
export const MAX_STEP_SPEED = 150; // m/s -> reject impossible jumps between samples
export const CRASH_TAIL_MS = 10_000; // final window ignored for landing/sag (impact)
