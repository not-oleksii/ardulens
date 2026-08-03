import { describe, expect, it } from "vitest";
import { DataflashBuilder } from "../../../builders/DataflashBuilder/DataflashBuilder";
import { FlightBinBuilder } from "../../../builders/FlightBinBuilder/FlightBinBuilder";
import { buildFlightMapDataFromBin } from "../fromBin";
import { isFlightMapData, isFlightMapError, isFlightMapInfo } from "../types";

describe("buildFlightMapDataFromBin", () => {
  it("builds flight-map data from a real-shaped .bin with POS/GPS", () => {
    const buf = new FlightBinBuilder().withDurationSeconds(60).build();
    const result = buildFlightMapDataFromBin("flight.bin", buf);
    expect(isFlightMapData(result)).toBe(true);
    if (!isFlightMapData(result)) return;
    expect(result.gcsTrack.length).toBeGreaterThan(0);
  });

  it("returns an info result for a buffer with no FMT-defined message types at all", () => {
    const garbage = new Uint8Array(200).fill(0x41).buffer;
    const result = buildFlightMapDataFromBin("garbage.bin", garbage);
    expect(isFlightMapInfo(result)).toBe(true);
    if (!isFlightMapInfo(result)) return;
    expect(result.info).toContain("TimeUS");
  });

  it("returns null for a valid dataflash log that has no POS/GPS message types", () => {
    const buf = new DataflashBuilder()
      .defineFormat(1, "BAT", ["Q", "f"], ["TimeUS", "Volt"])
      .addRecord(1, [0, 25.0])
      .addRecord(1, [1_000_000, 24.5])
      .build();
    const result = buildFlightMapDataFromBin("no-gps.bin", buf);
    expect(result).toBeNull();
    expect(isFlightMapError(result)).toBe(false);
    expect(isFlightMapInfo(result)).toBe(false);
  });
});
