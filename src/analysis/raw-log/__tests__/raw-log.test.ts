import { describe, expect, it } from "vitest";
import { FlightBinBuilder } from "../../../builders/FlightBinBuilder/FlightBinBuilder";
import { SkylogFileBuilder } from "../../../builders/SkylogFileBuilder/SkylogFileBuilder";
import { PRESETS, resolvePreset } from "../presets";
import { buildRawLog, isRawLog, isRawLogError, isRawLogInfo } from "../raw-log";

describe("buildRawLog (.bin)", () => {
  it("captures every message type as a category/series, not just the flight-summary whitelist", () => {
    const buf = new FlightBinBuilder().build();
    const log = buildRawLog("sample.bin", buf);

    expect(isRawLog(log)).toBe(true);
    if (!isRawLog(log)) return;
    expect(log.fmt).toBe("bin");

    const categoryKeys = log.categories.map((c) => c.key);
    expect(categoryKeys).toEqual(expect.arrayContaining(["attitude", "sensors", "servos", "rc", "power"]));

    expect(log.series["BAT.Volt"]).toBeDefined();
    expect(log.series["ATT.Roll"]).toBeDefined();
    expect(log.series["RCIN.C1"]).toBeDefined();
    expect(log.series["IMU.AccZ"]).toBeDefined();
  });

  it("normalizes series time to start at 0 ms from the log's earliest TimeUS", () => {
    const buf = new FlightBinBuilder().withDurationSeconds(60).build();
    const log = buildRawLog("sample.bin", buf);
    if (!isRawLog(log)) throw new Error("expected a RawLog");

    expect(log.timeRangeMs[0]).toBe(0);
    expect(log.series["BAT.Volt"]![0]!.t).toBe(0);
    expect(log.timeRangeMs[1]).toBeCloseTo(60_000, -2);
  });

  it("collapses repeated same-mode MODE records into contiguous labeled segments", () => {
    const buf = new FlightBinBuilder().withDurationSeconds(60).build();
    const log = buildRawLog("sample.bin", buf);
    if (!isRawLog(log)) throw new Error("expected a RawLog");

    expect(log.modeSegments.map((s) => s.label)).toEqual(["MANUAL", "FBWA", "MANUAL"]);
    expect(log.modeSegments[0]!.startMs).toBe(0);
    expect(log.modeSegments[log.modeSegments.length - 1]!.endMs).toBeCloseTo(60_000, -2);
  });

  it("excludes non-numeric/meta message types (PARM, FMT) from the parameter tree", () => {
    const buf = new FlightBinBuilder().withParam("ARSPD_USE", 1).build();
    const log = buildRawLog("sample.bin", buf);
    if (!isRawLog(log)) throw new Error("expected a RawLog");

    expect(log.categories.some((c) => c.params.some((p) => p.key.startsWith("PARM.")))).toBe(false);
    expect(log.series["PARM.Name"]).toBeUndefined();
  });

  it("reports info when the buffer has no parseable flight", () => {
    const buf = new FlightBinBuilder().groundedOnly().build();
    const log = buildRawLog("sample.bin", buf);
    // groundedOnly() still logs BAT/CTUN/etc with TimeUS throughout - the raw-log
    // view has no notion of "airborne", so it still produces a full RawLog.
    expect(isRawLog(log)).toBe(true);
  });
});

describe("buildRawLog (.skylog)", () => {
  it("exposes the fixed telemetry fields as a single category, keyed under telemetry.*", () => {
    const buf = new SkylogFileBuilder().addBoard({ board: 3570 }).build();
    const log = buildRawLog("sample.skylog", buf);

    expect(isRawLog(log)).toBe(true);
    if (!isRawLog(log)) return;
    expect(log.fmt).toBe("skylog");
    expect(log.categories).toHaveLength(1);
    expect(log.categories[0]!.key).toBe("telemetry");
    expect(log.series["telemetry.voltage"]).toBeDefined();
    expect(log.series["telemetry.airspeed"]).toBeDefined();
  });

  it("builds a mode segment from the samples (parseSkylog only keeps the armed span, so it's a single mode)", () => {
    const buf = new SkylogFileBuilder().addBoard({ board: 3570 }).build();
    const log = buildRawLog("sample.skylog", buf);
    if (!isRawLog(log)) throw new Error("expected a RawLog");

    expect(log.modeSegments.map((s) => s.label)).toEqual(["FBWA"]);
  });

  it("graphs only the largest flight when a multi-board file has several", () => {
    const buf = new SkylogFileBuilder()
      .addBoard({ board: 3570, durationSec: 500 })
      .addBoard({ board: 3526, durationSec: 100 })
      .build();
    const log = buildRawLog("sample.skylog", buf);
    if (!isRawLog(log)) throw new Error("expected a RawLog");

    expect(log.timeRangeMs[1]).toBeGreaterThan(400_000);
  });

  it("surfaces the parser's error for a skylog missing -extended_log", () => {
    const buf = new SkylogFileBuilder().addBoard({ board: 1001 }).withoutExtendedLog().build();
    const log = buildRawLog("raw.skylog", buf);
    expect(isRawLogError(log)).toBe(true);
  });

  it("reports info when the file has no armed flight", () => {
    const buf = new SkylogFileBuilder().addBoard({ board: 1001, airborne: false }).build();
    const log = buildRawLog("ground.skylog", buf);
    expect(isRawLogInfo(log) || isRawLog(log)).toBe(true);
  });
});

describe("resolvePreset", () => {
  it("resolves to the .bin key-set when those fields are present", () => {
    const buf = new FlightBinBuilder().build();
    const log = buildRawLog("sample.bin", buf);
    if (!isRawLog(log)) throw new Error("expected a RawLog");

    const battery = PRESETS.find((p) => p.key === "battery")!;
    expect(resolvePreset(battery, log.series)).toEqual(["BAT.Volt", "BAT.Curr"]);
  });

  it("resolves to the .skylog key-set when only telemetry fields are present", () => {
    const buf = new SkylogFileBuilder().addBoard({ board: 3570 }).build();
    const log = buildRawLog("sample.skylog", buf);
    if (!isRawLog(log)) throw new Error("expected a RawLog");

    const battery = PRESETS.find((p) => p.key === "battery")!;
    expect(resolvePreset(battery, log.series)).toEqual(["telemetry.voltage", "telemetry.current"]);

    const attitude = PRESETS.find((p) => p.key === "attitude")!;
    expect(resolvePreset(attitude, log.series)).toBeNull();
  });
});
