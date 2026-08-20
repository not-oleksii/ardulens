import { describe, expect, it } from "vitest";
import { parseParamFile } from "../param-file";

function toBuf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

describe("parseParamFile", () => {
  it("parses comma-separated dumps", () => {
    const text = ["# full parameter list", "FORMAT_VERSION,120", "SYSID_THISMAV,1"].join("\n");
    expect(parseParamFile(toBuf(text))).toEqual([
      { name: "FORMAT_VERSION", value: 120 },
      { name: "SYSID_THISMAV", value: 1 },
    ]);
  });

  it("parses whitespace-separated dumps", () => {
    const text = "ARSPD_USE 1\nBATT_CAPACITY\t5000";
    expect(parseParamFile(toBuf(text))).toEqual([
      { name: "ARSPD_USE", value: 1 },
      { name: "BATT_CAPACITY", value: 5000 },
    ]);
  });

  it("skips comments, blank lines and malformed lines", () => {
    const text = ["# comment", "", "NOT_A_VALID_LINE_NO_VALUE", "OK_PARAM,3.5"].join("\n");
    expect(parseParamFile(toBuf(text))).toEqual([{ name: "OK_PARAM", value: 3.5 }]);
  });
});
