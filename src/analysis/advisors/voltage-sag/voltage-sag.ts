import { landingVoltage, sagVoltage } from "../../metrics/metrics";
import { firstNum } from "../../../utils/samples/samples";
import type { Flight } from "../../../types";
import type { Advisor, Finding } from "../types";

// Relative drop thresholds (fraction of takeoff voltage) rather than absolute
// volts, since cell count varies between boards/batteries.
const WARN_DROP_FRACTION = 0.08;
const CRITICAL_DROP_FRACTION = 0.15;

export const voltageSagAdvisor: Advisor = (flight: Flight): Finding[] => {
  const takeoff = firstNum(flight.samples, "voltage");
  const sag = sagVoltage(flight.samples);
  if (takeoff === null || sag === null || takeoff <= 0) return [];

  const drop = (takeoff - sag) / takeoff;
  const params = { drop: (drop * 100).toFixed(0), takeoff: takeoff.toFixed(2), sag: sag.toFixed(2) };
  if (drop >= CRITICAL_DROP_FRACTION) {
    return [{ id: "voltage-sag-critical", severity: "critical", messageKey: "findings.voltageSagCritical", params }];
  }
  if (drop >= WARN_DROP_FRACTION) {
    return [{ id: "voltage-sag-warning", severity: "warning", messageKey: "findings.voltageSagWarning", params }];
  }
  return [];
};

const LOW_LANDING_DROP_FRACTION = 0.2;

export const landingVoltageAdvisor: Advisor = (flight: Flight): Finding[] => {
  const takeoff = firstNum(flight.samples, "voltage");
  const landing = landingVoltage(flight.samples);
  if (takeoff === null || landing === null || takeoff <= 0) return [];

  const drop = (takeoff - landing) / takeoff;
  if (drop >= LOW_LANDING_DROP_FRACTION) {
    return [
      {
        id: "landing-voltage-low",
        severity: "warning",
        messageKey: "findings.landingVoltageLow",
        params: { drop: (drop * 100).toFixed(0), takeoff: takeoff.toFixed(2), landing: landing.toFixed(2) },
      },
    ];
  }
  return [];
};
