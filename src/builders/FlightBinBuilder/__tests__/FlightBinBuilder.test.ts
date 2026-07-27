import { describe, expect, it } from "vitest";
import { sagVoltage } from "../../../analysis/metrics/metrics";
import { extractParamsFromBin } from "../../../parameters/dataflash-params/dataflash-params";
import { parseBin } from "../../../parsers/dataflash-bin/dataflash-bin";
import { isParsedFlights, isParsedInfo } from "../../../types";
import { trackStats } from "../../../utils/geo/geo";
import { FlightBinBuilder } from "../FlightBinBuilder";

describe("FlightBinBuilder", () => {
  it("produces a .bin buffer parseBin recognizes as one airborne flight", () => {
    const buf = new FlightBinBuilder().build();
    const result = parseBin(buf, "2002");

    expect(isParsedFlights(result)).toBe(true);
    if (!isParsedFlights(result)) return;
    expect(result.flights).toHaveLength(1);
    expect(result.flights[0]!.board).toBe("2002");
    expect(result.flights[0]!.timeReliable).toBe(false);
  });

  it("records the configured sag voltage at the first full-throttle sample", () => {
    const buf = new FlightBinBuilder().withVoltageCurve(25.0, 21.0, 22.5).build();
    const result = parseBin(buf);

    expect(isParsedFlights(result)).toBe(true);
    if (!isParsedFlights(result)) return;
    expect(sagVoltage(result.flights[0]!.samples)).toBeCloseTo(21.0, 1);
  });

  it("rejects exactly the requested number of GPS teleport spikes", () => {
    const buf = new FlightBinBuilder().withGpsTeleports(3).build();
    const result = parseBin(buf);

    expect(isParsedFlights(result)).toBe(true);
    if (!isParsedFlights(result)) return;
    expect(trackStats(result.flights[0]!).removed).toBe(3);
  });

  it("reports no flight when groundedOnly() is set", () => {
    const buf = new FlightBinBuilder().groundedOnly().build();
    expect(isParsedInfo(parseBin(buf))).toBe(true);
  });

  it("embeds PARM records extractable via extractParamsFromBin", () => {
    const buf = new FlightBinBuilder().withParam("ARSPD_USE", 1).withParam("BATT_CAPACITY", 5000).build();
    const params = extractParamsFromBin(buf);

    expect(params).toEqual(
      expect.arrayContaining([
        { name: "ARSPD_USE", value: 1, timestamp: 0 },
        { name: "BATT_CAPACITY", value: 5000, timestamp: 1_000_000 },
      ]),
    );
  });
});
