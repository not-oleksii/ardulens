import { describe, expect, it } from "vitest";
import {
  COLUMNS,
  computeRow,
  estimatedCapacityMah,
  isFlightSamples,
  landingVoltage,
  METRICS,
  modeChangeCount,
  sagVoltage,
  sagVoltagePercent,
} from "../metrics";
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

describe("sagVoltagePercent", () => {
  it("expresses the sag drop as a percentage of takeoff voltage", () => {
    const samples: Sample[] = [
      { t: 0, voltage: 25.0 },
      { t: 1000, voltage: 22.5, throttle: 100, airspeed: 12 },
    ];
    expect(sagVoltagePercent(samples)).toBeCloseTo(10, 5); // (25-22.5)/25*100
  });

  it("returns null when there is no sag sample", () => {
    expect(sagVoltagePercent([{ t: 0, voltage: 25, throttle: 50, airspeed: 12 }])).toBeNull();
  });
});

describe("estimatedCapacityMah", () => {
  it("trapezoidal-integrates current over elapsed time", () => {
    const samples: Sample[] = [
      { t: 0, current: 10 },
      { t: 3_600_000, current: 10 }, // 1 hour at a constant 10A -> 10,000 mAh
    ];
    expect(estimatedCapacityMah(samples)).toBeCloseTo(10_000, 5);
  });

  it("returns null when no consecutive pair both report current", () => {
    expect(estimatedCapacityMah([{ t: 0 }, { t: 1000 }])).toBeNull();
  });
});

describe("modeChangeCount", () => {
  it("counts transitions between consecutive defined modes", () => {
    const samples: Sample[] = [
      { t: 0, mode: 0 },
      { t: 1, mode: 5 },
      { t: 2, mode: 5 },
      { t: 3, mode: 0 },
    ];
    expect(modeChangeCount(samples)).toBe(2);
  });

  it("is zero when the mode never changes", () => {
    expect(modeChangeCount([{ t: 0, mode: 5 }, { t: 1, mode: 5 }])).toBe(0);
  });
});

describe("METRICS metadata", () => {
  it("gives every metric a translation key", () => {
    for (const m of METRICS) expect(m.key).toBeTruthy();
  });

  it("keeps the four suggested metrics out of the default column selection", () => {
    for (const key of ["sagPercent", "avgCurrent", "estimatedCapacityUsed", "modeChanges"]) {
      expect(METRICS.find((m) => m.key === key)?.defaultVisible).toBe(false);
    }
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
