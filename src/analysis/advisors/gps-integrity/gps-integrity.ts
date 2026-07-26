import { trackStats } from "../../../utils/geo/geo";
import type { Flight } from "../../../types";
import type { Advisor, Finding } from "../types";

// A handful of rejected points is normal GPS noise; a large share flags likely
// spoofing/EW rather than an occasional bad fix.
const WARN_REMOVED_COUNT = 5;
const CRITICAL_REMOVED_FRACTION = 0.1;

export const gpsIntegrityAdvisor: Advisor = (flight: Flight): Finding[] => {
  const { removed } = trackStats(flight);
  if (removed <= 0) return [];

  const total = flight.samples.length || 1;
  const fraction = removed / total;

  if (fraction >= CRITICAL_REMOVED_FRACTION) {
    return [
      {
        id: "gps-integrity-critical",
        severity: "critical",
        message: `Відкинуто ${removed} точок треку (${(fraction * 100).toFixed(0)}%) як телепорт/спуфінг - можливий вплив РЕБ протягом значної частини польоту.`,
      },
    ];
  }
  if (removed >= WARN_REMOVED_COUNT) {
    return [
      {
        id: "gps-integrity-warning",
        severity: "warning",
        message: `Відкинуто ${removed} точок треку як телепорт/спуфінг (РЕБ).`,
      },
    ];
  }
  return [];
};
