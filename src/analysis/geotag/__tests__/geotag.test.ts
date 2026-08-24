import { describe, expect, it } from "vitest";
import { DataflashBuilder } from "../../../builders/DataflashBuilder/DataflashBuilder";
import { extractCamGeoTags } from "../geotag";

const CAM = 1;

function buildBinWithCamRecords(records: Array<[number, number, number, number, number, number, number, number]>) {
  const b = new DataflashBuilder().defineFormat(
    CAM,
    "CAM",
    ["Q", "d", "d", "f", "f", "f", "f", "f"],
    ["TimeUS", "Lat", "Lng", "Alt", "RelAlt", "R", "P", "Y"],
  );
  for (const rec of records) b.addRecord(CAM, rec);
  return b.build();
}

describe("extractCamGeoTags", () => {
  it("returns an empty array when the log has no CAM records at all", () => {
    const buf = new DataflashBuilder().defineFormat(CAM, "CAM", ["Q"], ["TimeUS"]).build();
    expect(extractCamGeoTags(buf)).toEqual([]);
  });

  it("extracts one entry per CAM record, in order, with 0-based sequential index", () => {
    const buf = buildBinWithCamRecords([
      [0, 50.45, 30.52, 100, 40, 1, 2, 190],
      [1_000_000, 50.46, 30.53, 101, 41, -1, -2, 191],
    ]);
    const tags = extractCamGeoTags(buf);

    expect(tags).toHaveLength(2);
    const first = tags[0]!;
    expect(first.index).toBe(0);
    expect(first.timeUs).toBe(0);
    expect(first.lat).toBe(50.45);
    expect(first.lng).toBe(30.52);
    expect(first.altMsl).toBeCloseTo(100, 3);
    expect(first.altRel).toBeCloseTo(40, 3);
    expect(first.rollDeg).toBeCloseTo(1, 3);
    expect(first.pitchDeg).toBeCloseTo(2, 3);
    expect(first.yawDeg).toBeCloseTo(190, 3);
    expect(tags[1]!.index).toBe(1);
    expect(tags[1]!.timeUs).toBe(1_000_000);
  });
});
