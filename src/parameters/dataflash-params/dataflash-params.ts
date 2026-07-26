import { parseDataflash } from "../../parsers/dataflash-bin/dataflash-bin";
import type { ParameterEntry } from "../types";

/**
 * Extracts the full parameter dump embedded in a DataFlash .bin log (PARM
 * messages). ArduPilot logs one PARM record per parameter at boot, plus one
 * whenever a parameter changes in-flight - keep the last value per name.
 */
export function extractParamsFromBin(buf: ArrayBuffer): ParameterEntry[] {
  const tables = parseDataflash(buf);
  const PARM = tables["PARM"] ?? [];

  const byName = new Map<string, ParameterEntry>();
  for (const rec of PARM) {
    const name = rec["Name"];
    const value = rec["Value"];
    if (typeof name !== "string" || typeof value !== "number") continue;
    byName.set(name, { name, value, timestamp: rec["TimeUS"] as number | undefined });
  }

  return Array.from(byName.values());
}
