import { describe, expect, it } from "vitest";
import { COLUMNS, computeRow, isFlightSamples, landingVoltage, METRICS, sagVoltage } from "../metrics";
import type { Flight, Sample } from "../../../types";

const BASE_T = 1_752_650_000_000;

function makeSamples(): Sample[] {
  return [
    { t: BASE_T, voltage: 25.0, alt: 0, airspeed: 0, throttle: 50, mode: 0 },
    { t: BASE_T + 5_000, voltage: 24.8, current: 5, alt: 50, airspeed: 12, throttle: 100, mode: 5 },
    { t: BASE_T + 10_000, voltage: 23.5, current: 20, alt: 100, airspeed: 15, throttle: 80, mode: 5 },
    { t: BASE_T + 60_000, voltage: 21.0, alt: 80, airspeed: 10, throttle: 60, mode: 5 },
    { t: BASE_T + 68_000, voltage: 24.0, alt: 20, airspeed: 5, throttle: 0, mode: 0 },
    { t: BASE_T + 70_000, voltage: 23.9, alt: 10, airspeed: 2, throttle: 0, mode: 0 },
  ];
}

describe("landingVoltage", () => {
  it("takes the max voltage over the final 10s window (ignores the crash dip)", () => {
    expect(landingVoltage(makeSamples())).toBe(24.0);
  });

  it("falls back to the last known voltage when the tail window has none", () => {
    const samples: Sample[] = [{ t: 0, voltage: 22.1 }, { t: 5000 }];
    expect(landingVoltage(samples)).toBe(22.1);
  });
});

describe("sagVoltage", () => {
  it("returns the voltage at the first full-throttle airborne sample, excluding the crash tail", () => {
    expect(sagVoltage(makeSamples())).toBe(24.8);
  });

  it("returns null when throttle never reaches 100% while airborne", () => {
    const samples: Sample[] = [{ t: 0, voltage: 25, throttle: 50, airspeed: 12 }];
    expect(sagVoltage(samples)).toBeNull();
  });
});

describe("isFlightSamples", () => {
  it("is true when altitude or airspeed crosses the airborne thresholds", () => {
    expect(isFlightSamples(makeSamples())).toBe(true);
  });

  it("is false for a ground-only segment", () => {
    expect(isFlightSamples([{ t: 0, alt: 2, airspeed: 1 }])).toBe(false);
  });
});

describe("computeRow", () => {
  function makeFlight(timeReliable: boolean): Flight {
    return { board: "3570", timeReliable, fmt: timeReliable ? "skylog" : "bin", samples: makeSamples() };
  }

  it("produces one cell per declared metric, in order", () => {
    const { row } = computeRow(makeFlight(true));
    expect(row).toHaveLength(METRICS.length);
    expect(row).toHaveLength(COLUMNS.length);
    expect(row[0]).toBe("3570");
    expect(row[1]).toBe("25.00"); // takeoff voltage
    expect(row[2]).toBe("24.00"); // landing voltage
    expect(row[3]).toBe("24.80"); // sag voltage
    expect(row[4]).toBe("20.0"); // max current
    expect(row[5]).toBe("15.0"); // max airspeed
  });

  it("flags takeoff/landing time as manual-only when the clock is unreliable (.bin)", () => {
    const { row, manualCols } = computeRow(makeFlight(false));
    const takeoffIdx = METRICS.findIndex((m) => m.h === "Час взльоту (hh:mm)");
    const landingIdx = METRICS.findIndex((m) => m.h === "Час посадки (hh:mm)");
    expect(manualCols).toEqual(expect.arrayContaining([takeoffIdx, landingIdx]));
    expect(row[takeoffIdx]).toBe("");
    expect(row[landingIdx]).toBe("");
  });

  it("does not flag time columns as manual when the clock is reliable (skylog)", () => {
    const { manualCols } = computeRow(makeFlight(true));
    expect(manualCols).toEqual([]);
  });

  it("marks a flight as ground when max altitude stays below 30m", () => {
    const flight: Flight = {
      board: "1",
      timeReliable: true,
      fmt: "skylog",
      samples: [{ t: 0, alt: 5, airspeed: 20 }, { t: 1000, alt: 10, airspeed: 22 }],
    };
    expect(computeRow(flight).ground).toBe(true);
  });
});
