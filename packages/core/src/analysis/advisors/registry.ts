import { gpsIntegrityAdvisor } from "./gps-integrity.js";
import { landingVoltageAdvisor, voltageSagAdvisor } from "./voltage-sag.js";
import type { Advisor, Finding } from "./types.js";
import type { Flight } from "../../types.js";

/** Ordered registry: add a new advisor by writing one file and listing it here. */
export const ADVISORS: Advisor[] = [voltageSagAdvisor, landingVoltageAdvisor, gpsIntegrityAdvisor];

export function runAdvisors(flight: Flight, advisors: Advisor[] = ADVISORS): Finding[] {
  return advisors.flatMap((advisor) => advisor(flight));
}

export type { Advisor, Finding, Severity } from "./types.js";
