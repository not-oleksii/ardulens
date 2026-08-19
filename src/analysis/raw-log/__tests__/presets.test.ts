import { describe, expect, it } from "vitest";
import { PRESETS, resolvePreset } from "../presets";

describe("PID-rate presets", () => {
  it("declares one preset per roll/pitch/yaw axis, matching PidTuneSection's AXIS_PRESET_KEYS", () => {
    const keys = PRESETS.map((p) => p.key);
    expect(keys).toContain("pidRoll");
    expect(keys).toContain("pidPitch");
    expect(keys).toContain("pidYaw");
  });

  it("resolves pidRoll against a series carrying RATE.RDes/RATE.R", () => {
    const preset = PRESETS.find((p) => p.key === "pidRoll")!;
    const series = { "RATE.RDes": [], "RATE.R": [], "RATE.PDes": [] };
    expect(resolvePreset(preset, series)).toEqual(["RATE.RDes", "RATE.R"]);
  });

  it("does not resolve pidPitch when only the desired half of the pair is present", () => {
    const preset = PRESETS.find((p) => p.key === "pidPitch")!;
    expect(resolvePreset(preset, { "RATE.PDes": [] })).toBeNull();
  });

  it("resolves pidYaw against a series carrying RATE.YDes/RATE.Y", () => {
    const preset = PRESETS.find((p) => p.key === "pidYaw")!;
    expect(resolvePreset(preset, { "RATE.YDes": [], "RATE.Y": [] })).toEqual(["RATE.YDes", "RATE.Y"]);
  });
});
