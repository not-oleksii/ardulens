import { describe, expect, it } from "vitest";
import { getParamDoc } from "../param-docs";

describe("getParamDoc", () => {
  it("returns the field-specific description and a doc link for a known message field", () => {
    const doc = getParamDoc("BAT.Volt");
    expect(doc).not.toBeNull();
    expect(doc!.text).toMatch(/voltage/i);
    expect(doc!.url).toBe("https://ardupilot.org/plane/docs/logmessages.html#bat");
  });

  it("shares field docs between a base sensor message and its numbered instances", () => {
    const base = getParamDoc("BAT.Curr");
    const numbered = getParamDoc("BAT2.Curr");
    expect(numbered).not.toBeNull();
    expect(numbered!.text).toBe(base!.text);
    expect(numbered!.url).toBe("https://ardupilot.org/plane/docs/logmessages.html#bat");
  });

  it("falls back to the message-level summary when a specific field isn't documented", () => {
    const doc = getParamDoc("ATT.SomeFutureField");
    expect(doc).not.toBeNull();
    expect(doc!.text).toMatch(/attitude/i);
  });

  it("describes .skylog's synthesized telemetry fields without a doc link", () => {
    const doc = getParamDoc("telemetry.voltage");
    expect(doc).not.toBeNull();
    expect(doc!.text).toMatch(/voltage/i);
    expect(doc!.url).toBeUndefined();
  });

  it("returns null for a completely unknown message and for keys with no field part", () => {
    expect(getParamDoc("NOPE.Field")).toBeNull();
    expect(getParamDoc("NoDotAtAll")).toBeNull();
  });

  it("covers every message/field this app can categorize (ATT, IMU, RCIN, RCOU, VIBE, etc.)", () => {
    const keys = [
      "ATT.Roll",
      "AHR2.Yaw",
      "IMU.GyrX",
      "BARO.Alt",
      "MAG.MagX",
      "ARSP.Airspeed",
      "GPS.NSats",
      "CTUN.ThO",
      "MCU.MTemp",
      "VIBE.VibeX",
      "RCIN.C1",
      "RCOU.C1",
      "CURR.Volt",
      "POWR.Vcc",
    ];
    for (const key of keys) {
      expect(getParamDoc(key), key).not.toBeNull();
    }
  });
});
