import type { ParameterEntry } from "./types.js";

/**
 * Parses standalone .param files (Mission Planner "NAME,VALUE" or MAVProxy
 * "NAME VALUE" whitespace-separated dumps). Comment lines start with "#".
 */
export function parseParamFile(buf: ArrayBuffer): ParameterEntry[] {
  const text = new TextDecoder("utf-8").decode(buf);
  const out: ParameterEntry[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.includes(",") ? line.split(",") : line.split(/\s+/);
    if (parts.length < 2) continue;

    const name = parts[0]!.trim();
    const value = parseFloat(parts[1]!.trim());
    if (!name || Number.isNaN(value)) continue;

    out.push({ name, value });
  }

  return out;
}
