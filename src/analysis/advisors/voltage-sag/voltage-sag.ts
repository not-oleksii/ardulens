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
  if (drop >= CRITICAL_DROP_FRACTION) {
    return [
      {
        id: "voltage-sag-critical",
        severity: "critical",
        message: `Критична просадка напруги під газом: ${(drop * 100).toFixed(0)}% від злітної (${takeoff.toFixed(2)} В -> ${sag.toFixed(2)} В).`,
      },
    ];
  }
  if (drop >= WARN_DROP_FRACTION) {
    return [
      {
        id: "voltage-sag-warning",
        severity: "warning",
        message: `Помітна просадка напруги під газом: ${(drop * 100).toFixed(0)}% від злітної (${takeoff.toFixed(2)} В -> ${sag.toFixed(2)} В).`,
      },
    ];
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
        message: `Низька напруга при посадці: ${(drop * 100).toFixed(0)}% нижче злітної (${takeoff.toFixed(2)} В -> ${landing.toFixed(2)} В).`,
      },
    ];
  }
  return [];
};
