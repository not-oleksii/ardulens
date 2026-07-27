import { describe, expect, it } from "vitest";
import { avgOf, firstNum, isAirborne, isFlying, maxOf } from "../samples";
import type { Sample } from "../../../types";

describe("firstNum", () => {
  it("returns the first sample with a numeric value for the key", () => {
    const samples: Sample[] = [{ t: 0 }, { t: 1, voltage: 12.4 }, { t: 2, voltage: 12.1 }];
    expect(firstNum(samples, "voltage")).toBe(12.4);
  });

  it("returns null when no sample has the key", () => {
    expect(firstNum([{ t: 0 }], "voltage")).toBeNull();
  });
});

describe("maxOf", () => {
  it("returns the maximum numeric value for the key", () => {
    const samples: Sample[] = [{ t: 0, alt: 5 }, { t: 1, alt: 50 }, { t: 2, alt: 20 }];
    expect(maxOf(samples, "alt")).toBe(50);
  });

  it("returns null when no sample has the key", () => {
    expect(maxOf([{ t: 0 }], "alt")).toBeNull();
  });
});

describe("avgOf", () => {
  it("returns the mean of the numeric values for the key", () => {
    const samples: Sample[] = [{ t: 0, current: 10 }, { t: 1, current: 20 }, { t: 2, current: 30 }];
    expect(avgOf(samples, "current")).toBe(20);
  });

  it("returns null when no sample has the key", () => {
    expect(avgOf([{ t: 0 }], "current")).toBeNull();
  });
});

describe("isFlying / isAirborne", () => {
  it("treats airspeed above the threshold as flying", () => {
    expect(isFlying({ t: 0, airspeed: 10 })).toBe(true);
    expect(isFlying({ t: 0, airspeed: 9.9 })).toBe(false);
  });

  it("treats a known air mode as airborne even at low airspeed", () => {
    expect(isAirborne({ t: 0, airspeed: 0, mode: 5 })).toBe(true);
    expect(isAirborne({ t: 0, airspeed: 0, mode: 0 })).toBe(false);
  });
});
