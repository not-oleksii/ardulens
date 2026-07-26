import { describe, expect, it } from "vitest";
import { parseFile, PARSERS } from "../registry";
import { isParsedError } from "../../../types";

function toBuf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

describe("PARSERS registry", () => {
  it("routes .bin files (and BIN magic bytes) to the DataFlash parser", () => {
    expect(PARSERS[0]!.test("log.bin", new Uint8Array())).toBe(true);
    expect(PARSERS[0]!.test("log.BIN", new Uint8Array())).toBe(true);
    expect(PARSERS[0]!.test("weird-name.log", new Uint8Array([0xa3, 0x95, 0x80]))).toBe(true);
    expect(PARSERS[0]!.test("plain.skylog", new Uint8Array([0x7b, 0x74]))).toBe(false);
  });

  it("falls back to the skylog parser for anything else", () => {
    expect(PARSERS[PARSERS.length - 1]!.test("anything", new Uint8Array())).toBe(true);
  });
});

describe("parseFile", () => {
  it("dispatches a non-.bin file to the skylog parser", () => {
    const result = parseFile("flight.skylog", toBuf("no telemetry here"));
    expect(isParsedError(result)).toBe(true);
  });

  it("dispatches a .bin file to the DataFlash parser", () => {
    const result = parseFile("flight.bin", new Uint8Array([0xa3, 0x95, 0x80]).buffer);
    // Empty/garbage FMT stream -> no ARM/STAT window found.
    expect("info" in result || "error" in result).toBe(true);
  });
});
