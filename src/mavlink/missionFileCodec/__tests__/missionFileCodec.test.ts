import { describe, expect, it } from "vitest";
import type { MissionItemEntry } from "../../../stores/mavlinkMissionStore/types";
import { formatWaypointsFile, parseWaypointsFile } from "../missionFileCodec";

const SAMPLE_ITEMS: MissionItemEntry[] = [
  { seq: 0, command: 16, frame: 3, autocontinue: true, param1: 0, param2: 0, param3: 0, param4: 0, lat: 50.4501, lon: 30.5234, alt: 0 },
  { seq: 1, command: 16, frame: 3, autocontinue: true, param1: 0, param2: 5, param3: 0, param4: 0, lat: 50.4531, lon: 30.5264, alt: 50 },
  { seq: 2, command: 20, frame: 3, autocontinue: true, param1: 0, param2: 0, param3: 0, param4: 0, lat: 0, lon: 0, alt: 0 },
];

describe("formatWaypointsFile / parseWaypointsFile", () => {
  it("round-trips a mission through the QGC WPL 110 text format unchanged", () => {
    const text = formatWaypointsFile(SAMPLE_ITEMS);
    expect(text.split("\n")[0]).toBe("QGC WPL 110");
    expect(parseWaypointsFile(text)).toEqual(SAMPLE_ITEMS);
  });

  it("marks only the first (seq 0) row as the current waypoint", () => {
    const text = formatWaypointsFile(SAMPLE_ITEMS);
    const lines = text.trim().split("\n");
    expect(lines[1]!.split("\t")[1]).toBe("1"); // seq 0 row
    expect(lines[2]!.split("\t")[1]).toBe("0"); // seq 1 row
    expect(lines[3]!.split("\t")[1]).toBe("0"); // seq 2 row
  });

  it("rejects a file with no QGC WPL header", () => {
    expect(() => parseWaypointsFile("not a waypoint file\n1\t2\t3")).toThrow(/QGC WPL/);
  });

  it("rejects a data row with the wrong column count", () => {
    const badFile = "QGC WPL 110\n0\t1\t3\t16\t0\t0\t0\t0\t50.45\t30.52\n"; // missing alt/autocontinue columns
    expect(() => parseWaypointsFile(badFile)).toThrow(/12 tab-separated columns/);
  });

  it("reads a real QGroundControl-style file (CRLF line endings, trailing blank line)", () => {
    const text = "QGC WPL 110\r\n0\t1\t3\t16\t0\t0\t0\t0\t50.4501\t30.5234\t0\t1\r\n\r\n";
    const items = parseWaypointsFile(text);
    expect(items).toEqual([{ seq: 0, command: 16, frame: 3, autocontinue: true, param1: 0, param2: 0, param3: 0, param4: 0, lat: 50.4501, lon: 30.5234, alt: 0 }]);
  });
});
