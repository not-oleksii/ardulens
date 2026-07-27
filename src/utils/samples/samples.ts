import { AIRBORNE_SPEED, AIR_MODES } from "../../constants";
import type { Sample } from "../../types";

export function firstNum(samples: Sample[], key: keyof Sample): number | null {
  for (const s of samples) {
    const v = s[key];
    if (typeof v === "number") return v;
  }
  return null;
}

export function maxOf(samples: Sample[], key: keyof Sample): number | null {
  let m: number | null = null;
  for (const s of samples) {
    const v = s[key];
    if (typeof v === "number" && (m === null || v > m)) m = v;
  }
  return m;
}

export function avgOf(samples: Sample[], key: keyof Sample): number | null {
  let sum = 0;
  let count = 0;
  for (const s of samples) {
    const v = s[key];
    if (typeof v === "number") {
      sum += v;
      count++;
    }
  }
  return count ? sum / count : null;
}

export function isFlying(s: Sample): boolean {
  return typeof s.airspeed === "number" && s.airspeed >= AIRBORNE_SPEED;
}

export function isAirborne(s: Sample): boolean {
  return isFlying(s) || (typeof s.mode === "number" && AIR_MODES.has(s.mode));
}
