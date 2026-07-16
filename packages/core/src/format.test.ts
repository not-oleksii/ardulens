import { describe, expect, it } from "vitest";
import { fmtDurMs, fmtKyiv, r0, r1, r2 } from "./format.js";

describe("rounding formatters", () => {
  it("return an empty string for null", () => {
    expect(r0(null)).toBe("");
    expect(r1(null)).toBe("");
    expect(r2(null)).toBe("");
  });

  it("round to the expected precision", () => {
    expect(r0(12.6)).toBe("13");
    expect(r1(12.34)).toBe("12.3");
    expect(r2(12.345)).toBe("12.35");
  });
});

describe("fmtDurMs", () => {
  it("formats minutes as mm:ss padded to 2 digits", () => {
    expect(fmtDurMs(0)).toBe("00:00");
    expect(fmtDurMs(90_000)).toBe("00:02"); // rounds to nearest minute
    expect(fmtDurMs(65 * 60_000)).toBe("01:05");
  });

  it("clamps negative durations to zero", () => {
    expect(fmtDurMs(-5000)).toBe("00:00");
  });
});

describe("fmtKyiv", () => {
  it("formats as HH:MM", () => {
    const out = fmtKyiv(Date.UTC(2026, 6, 16, 10, 30));
    expect(out).toMatch(/^\d{2}:\d{2}$/);
  });
});
