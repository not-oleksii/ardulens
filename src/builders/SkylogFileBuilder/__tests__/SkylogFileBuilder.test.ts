import { describe, expect, it } from "vitest";
import { parseSkylog } from "../../../parsers/skylog/skylog";
import { isParsedError, isParsedFlights } from "../../../types";
import { SkylogFileBuilder } from "../SkylogFileBuilder";

describe("SkylogFileBuilder", () => {
  it("produces a skylog parseSkylog recognizes as one flight", () => {
    const buf = new SkylogFileBuilder().addBoard({ board: 1001 }).build();
    const result = parseSkylog(buf);

    expect(isParsedFlights(result)).toBe(true);
    if (!isParsedFlights(result)) return;
    expect(result.flights).toHaveLength(1);
    expect(result.flights[0]!.board).toBe("1001");
    expect(result.flights[0]!.timeReliable).toBe(true);
  });

  it("produces a multi-board file when addBoard is called more than once", () => {
    const buf = new SkylogFileBuilder().addBoard({ board: 1001 }).addBoard({ board: 1002 }).build();
    const result = parseSkylog(buf);

    expect(isParsedFlights(result)).toBe(true);
    if (!isParsedFlights(result)) return;
    expect(result.flights).toHaveLength(2);
    expect(result.boards.sort()).toEqual(["1001", "1002"]);
  });

  it("errors with the missing -extended_log message when withoutExtendedLog() is set", () => {
    const buf = new SkylogFileBuilder().addBoard({ board: 1001 }).withoutExtendedLog().build();
    const result = parseSkylog(buf);

    expect(isParsedError(result)).toBe(true);
    if (!isParsedError(result)) return;
    expect(result.error).toMatch(/-extended_log/);
  });

  it("filters out a board that never got airborne", () => {
    const buf = new SkylogFileBuilder().addBoard({ board: 1001, airborne: false }).build();
    const result = parseSkylog(buf);

    expect(isParsedFlights(result)).toBe(true);
    if (!isParsedFlights(result)) return;
    expect(result.flights).toHaveLength(0);
  });
});
