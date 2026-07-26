import { gpsIntegrityAdvisor } from "../gps-integrity/gps-integrity";
import { landingVoltageAdvisor, voltageSagAdvisor } from "../voltage-sag/voltage-sag";
import type { Advisor, Finding } from "../types";
import type { Flight } from "../../../types";

/** Ordered registry: add a new advisor by writing one file and listing it here. */
export const ADVISORS: Advisor[] = [voltageSagAdvisor, landingVoltageAdvisor, gpsIntegrityAdvisor];

export function runAdvisors(flight: Flight, advisors: Advisor[] = ADVISORS): Finding[] {
  return advisors.flatMap((advisor) => advisor(flight));
}

export type { Advisor, Finding, Severity } from "../types";
