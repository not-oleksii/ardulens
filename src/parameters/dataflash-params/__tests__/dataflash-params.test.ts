import { describe, expect, it } from "vitest";
import { extractParamsFromBin } from "../dataflash-params";
import { DataflashBuilder } from "../../../builders/DataflashBuilder/DataflashBuilder";

const PARM = 1;

describe("extractParamsFromBin", () => {
  it("extracts name/value pairs from PARM messages", () => {
    const b = new DataflashBuilder()
      .defineFormat(PARM, "PARM", ["Q", "N", "f"], ["TimeUS", "Name", "Value"])
      .addRecord(PARM, [0, "ARSPD_USE", 1])
      .addRecord(PARM, [1000, "BATT_CAPACITY", 5000]);

    const params = extractParamsFromBin(b.build());
    expect(params).toHaveLength(2);
    expect(params).toEqual(
      expect.arrayContaining([
        { name: "ARSPD_USE", value: 1, timestamp: 0 },
        { name: "BATT_CAPACITY", value: 5000, timestamp: 1000 },
      ]),
    );
  });

  it("keeps only the last logged value when a parameter changes in-flight", () => {
    const b = new DataflashBuilder()
      .defineFormat(PARM, "PARM", ["Q", "N", "f"], ["TimeUS", "Name", "Value"])
      .addRecord(PARM, [0, "ARSPD_USE", 1])
      .addRecord(PARM, [5000, "ARSPD_USE", 0]);

    const params = extractParamsFromBin(b.build());
    expect(params).toEqual([{ name: "ARSPD_USE", value: 0, timestamp: 5000 }]);
  });

  it("returns an empty list when there are no PARM messages", () => {
    const b = new DataflashBuilder().defineFormat(PARM, "PARM", ["Q", "N", "f"], ["TimeUS", "Name", "Value"]);
    expect(extractParamsFromBin(b.build())).toEqual([]);
  });
});
