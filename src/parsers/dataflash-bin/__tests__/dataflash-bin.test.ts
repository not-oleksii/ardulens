import { describe, expect, it } from "vitest";
import { parseBin } from "../dataflash-bin";
import { DataflashBuilder } from "../../../builders/DataflashBuilder/DataflashBuilder";
import { isParsedError, isParsedFlights, isParsedInfo } from "../../../types";

const BAT = 1;
const CTUN = 2;
const ARSP = 3;
const ARM = 4;
const MODE = 5;
const POS = 6;
const STAT = 7;

function defineCommonFormats(b: DataflashBuilder): DataflashBuilder {
  return b
    .defineFormat(BAT, "BAT", ["Q", "f", "f"], ["TimeUS", "Volt", "Curr"])
    .defineFormat(CTUN, "CTUN", ["Q", "f"], ["TimeUS", "ThO"])
    .defineFormat(ARSP, "ARSP", ["Q", "f"], ["TimeUS", "Airspeed"])
    .defineFormat(ARM, "ARM", ["Q", "B"], ["TimeUS", "ArmState"])
    .defineFormat(MODE, "MODE", ["Q", "B"], ["TimeUS", "ModeNum"])
    .defineFormat(POS, "POS", ["Q", "d", "d", "f"], ["TimeUS", "Lat", "Lng", "RelHomeAlt"]);
}

describe("parseBin", () => {
  it("extracts a flight from an ARM(1->0) window with fused POS altitude/track", () => {
    const b = defineCommonFormats(new DataflashBuilder())
      .addRecord(ARM, [0, 1])
      .addRecord(ARM, [70_000_000, 0])
      .addRecord(BAT, [0, 25.0, 5.0])
      .addRecord(BAT, [5_000_000, 24.8, 20.0])
      .addRecord(BAT, [65_000_000, 21.0, 1.0])
      .addRecord(BAT, [69_000_000, 24.0, 0])
      .addRecord(CTUN, [0, 50])
      .addRecord(CTUN, [5_000_000, 100])
      .addRecord(CTUN, [60_000_000, 60])
      .addRecord(ARSP, [0, 0])
      .addRecord(ARSP, [5_000_000, 12])
      .addRecord(ARSP, [10_000_000, 15])
      .addRecord(MODE, [0, 0])
      .addRecord(MODE, [5_000_000, 5])
      .addRecord(POS, [0, 50.0, 30.0, 0])
      .addRecord(POS, [5_000_000, 50.0001, 30.0001, 50])
      .addRecord(POS, [10_000_000, 50.0002, 30.0002, 100])
      .addRecord(POS, [60_000_000, 50.0003, 30.0003, 80])
      .addRecord(POS, [69_000_000, 50.0004, 30.0004, 10]);

    const result = parseBin(b.build(), "3570");
    expect(isParsedFlights(result)).toBe(true);
    if (!isParsedFlights(result)) return;

    expect(result.fmt).toBe("bin");
    expect(result.boards).toEqual(["3570"]);
    expect(result.flights).toHaveLength(1);

    const flight = result.flights[0]!;
    expect(flight.timeReliable).toBe(false);
    expect(flight.board).toBe("3570");
    // ~701 samples: (70_000_000 - 0) / 100_000 (us step) + 1
    expect(flight.samples.length).toBe(701);
    expect(flight.samples[0]!.t).toBe(0);
    expect(flight.samples[flight.samples.length - 1]!.t).toBe(70_000);
    expect(Math.max(...flight.samples.map((s) => s.alt ?? 0))).toBe(100);
  });

  it("reports info when there is no ARM pair and no STAT.Armed span", () => {
    const b = defineCommonFormats(new DataflashBuilder());
    const result = parseBin(b.build());
    expect(isParsedInfo(result)).toBe(true);
  });

  it("falls back to the STAT.Armed span when ARM pairs are missing", () => {
    const b = defineCommonFormats(new DataflashBuilder())
      .defineFormat(STAT, "STAT", ["Q", "B"], ["TimeUS", "Armed"])
      .addRecord(STAT, [0, 1])
      .addRecord(STAT, [70_000_000, 1])
      .addRecord(BAT, [0, 25.0, 5.0])
      .addRecord(POS, [0, 50.0, 30.0, 0])
      .addRecord(POS, [70_000_000, 50.0001, 30.0001, 40]);

    const result = parseBin(b.build(), "3526");
    expect(isParsedFlights(result)).toBe(true);
  });

  it("reports info when the board armed but never got airborne", () => {
    const b = defineCommonFormats(new DataflashBuilder())
      .addRecord(ARM, [0, 1])
      .addRecord(ARM, [70_000_000, 0])
      .addRecord(POS, [0, 50.0, 30.0, 0])
      .addRecord(POS, [70_000_000, 50.0001, 30.0001, 2]); // stays under 30m and under 15 m/s

    const result = parseBin(b.build());
    expect(isParsedInfo(result)).toBe(true);
  });

  it("never returns an error result for a well-formed buffer", () => {
    const b = defineCommonFormats(new DataflashBuilder());
    expect(isParsedError(parseBin(b.build()))).toBe(false);
  });

  it("falls back to raw GPS and normalizes AMSL altitude to relative when POS is absent", () => {
    const GPS = 8;
    const b = new DataflashBuilder()
      .defineFormat(ARM, "ARM", ["Q", "B"], ["TimeUS", "ArmState"])
      .defineFormat(GPS, "GPS", ["Q", "B", "d", "d", "f"], ["TimeUS", "I", "Lat", "Lng", "Alt"])
      .addRecord(ARM, [0, 1])
      .addRecord(ARM, [70_000_000, 0])
      .addRecord(GPS, [0, 0, 50.0, 30.0, 120]) // AMSL altitude, not relative
      .addRecord(GPS, [5_000_000, 0, 50.0001, 30.0001, 170])
      .addRecord(GPS, [10_000_000, 0, 50.0002, 30.0002, 220])
      .addRecord(GPS, [60_000_000, 0, 50.0003, 30.0003, 150])
      .addRecord(GPS, [69_000_000, 0, 50.0004, 30.0004, 125]);

    const result = parseBin(b.build());
    expect(isParsedFlights(result)).toBe(true);
    if (!isParsedFlights(result)) return;

    const alts = result.flights[0]!.samples.map((s) => s.alt ?? 0);
    expect(alts[0]).toBe(0); // relative to the takeoff (first) sample
    expect(Math.max(...alts)).toBe(100); // 220 - 120
  });

  it("merges two ARM(1->0) windows separated by a short re-arm gap (<30s)", () => {
    const b = defineCommonFormats(new DataflashBuilder())
      .addRecord(ARM, [0, 1])
      .addRecord(ARM, [65_000_000, 0]) // first window: 65s (qualifies as a flight on its own)
      .addRecord(ARM, [85_000_000, 1]) // re-armed 20s later (<30s gap)
      .addRecord(ARM, [150_000_000, 0]) // second window: another 65s
      .addRecord(POS, [0, 50.0, 30.0, 0])
      .addRecord(POS, [10_000_000, 50.0001, 30.0001, 100])
      .addRecord(POS, [150_000_000, 50.0002, 30.0002, 50]);

    const result = parseBin(b.build());
    expect(isParsedFlights(result)).toBe(true);
    if (!isParsedFlights(result)) return;

    expect(result.flights).toHaveLength(1);
    const flight = result.flights[0]!;
    expect(flight.samples[0]!.t).toBe(0);
    expect(flight.samples[flight.samples.length - 1]!.t).toBe(150_000);
  });
});
