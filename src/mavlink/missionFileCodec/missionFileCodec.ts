import type { MissionItemEntry } from "../../stores/mavlinkMissionStore/types";

// The "QGC WPL 110" plain-text mission format - not this app's own invention, but the de facto
// standard both Mission Planner and QGroundControl read/write (tab-separated, one header line
// then one line per item: index, current-wp flag, frame, command, param1-4, lat, lon, alt,
// autocontinue). Writing/reading this exact format means a mission saved here opens directly in
// either of those tools, and vice versa - confirmed against QGroundControl's own published
// PlanFileFormat.md and Mission Planner's WaypointFile reader.
const WPL_HEADER = "QGC WPL 110";

export function formatWaypointsFile(items: MissionItemEntry[]): string {
  const lines = [WPL_HEADER];
  for (const item of items) {
    lines.push(
      [
        item.seq,
        item.seq === 0 ? 1 : 0, // "current wp" flag - conventionally only ever set on the home/first row
        item.frame,
        item.command,
        item.param1,
        item.param2,
        item.param3,
        item.param4,
        item.lat,
        item.lon,
        item.alt,
        item.autocontinue ? 1 : 0,
      ].join("\t"),
    );
  }
  return lines.join("\n") + "\n";
}

/** Throws with a human-readable message on a malformed file - callers show it directly. */
export function parseWaypointsFile(text: string): MissionItemEntry[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0 || !lines[0]!.trim().startsWith("QGC WPL")) {
    throw new Error(`Not a QGC WPL waypoint file (expected a "QGC WPL ..." header line)`);
  }
  const items: MissionItemEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split("\t").map((c) => c.trim());
    if (cols.length < 12) throw new Error(`Line ${i + 1}: expected 12 tab-separated columns, got ${cols.length}`);
    const [seq, , frame, command, param1, param2, param3, param4, lat, lon, alt, autocontinue] = cols.map(Number);
    items.push({
      seq: seq!,
      frame: frame!,
      command: command!,
      param1: param1!,
      param2: param2!,
      param3: param3!,
      param4: param4!,
      lat: lat!,
      lon: lon!,
      alt: alt!,
      autocontinue: autocontinue !== 0,
    });
  }
  return items.sort((a, b) => a.seq - b.seq);
}
