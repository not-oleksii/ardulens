import { afterEach, describe, expect, it, vi } from "vitest";
import { MavType } from "../../../mavlink/registry/registry";
import {
  fetchParamDocs,
  paramDocsPageUrl,
  parsePdefXml,
  vehicleFolderForMavType,
} from "../ardupilotParamDocs";

const SAMPLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<paramfile>
  <vehicles>
    <parameters name="ArduCopter">
      <param humanName="Throttle filter cutoff" name="ArduCopter:PILOT_THR_FILT" documentation="Throttle filter cutoff (Hz)">
        <field name="Units">Hz</field>
      </param>
      <param humanName="Roll P gain (multirotor)" name="ArduCopter:ATC_RAT_RLL_P" documentation="Multirotor roll rate P gain">
      </param>
      <param humanName="Angle Max" name="ArduCopter:ANGLE_MAX" documentation="Maximum lean angle in all flight modes">
        <field name="Units">deg</field>
        <field name="Range">10.0 80.0</field>
      </param>
      <param humanName="Servo output function" name="ArduCopter:SERVO1_FUNCTION" documentation="Function assigned to this servo">
        <values>
          <value code="-1">GPIO</value>
          <value code="0">Disabled</value>
          <value code="4">Aileron</value>
        </values>
      </param>
      <param humanName="Failsafe options bitmask" name="ArduCopter:FS_OPTIONS" documentation="Bitmask of additional options">
        <bitmask>
          <bit code="0">Continue if in Auto on RC failsafe</bit>
          <bit code="1">Continue if in Auto on GCS failsafe</bit>
        </bitmask>
      </param>
    </parameters>
  </vehicles>
  <libraries>
    <parameters name="GPS_">
      <param humanName="GPS type" name="GPS_TYPE" documentation="GPS type selection">
      </param>
      <param humanName="Roll P gain (heli)" name="ATC_RAT_RLL_P" documentation="Heli roll rate P gain - should be ignored, first wins">
      </param>
    </parameters>
  </libraries>
</paramfile>`;

describe("parsePdefXml", () => {
  it("strips the vehicle-name prefix from vehicle-section param names", () => {
    const docs = parsePdefXml(SAMPLE_XML);
    expect(docs["PILOT_THR_FILT"]).toEqual({
      humanName: "Throttle filter cutoff",
      documentation: "Throttle filter cutoff (Hz)",
      units: "Hz",
    });
  });

  it("parses a <field name=\"Range\"> into a {min, max} pair", () => {
    const docs = parsePdefXml(SAMPLE_XML);
    expect(docs["ANGLE_MAX"]?.range).toEqual({ min: 10, max: 80 });
  });

  it("omits units/range for params with neither field", () => {
    const docs = parsePdefXml(SAMPLE_XML);
    expect(docs["ATC_RAT_RLL_P"]).not.toHaveProperty("units");
    expect(docs["ATC_RAT_RLL_P"]).not.toHaveProperty("range");
  });

  it("keeps library-section param names as-is (no vehicle prefix)", () => {
    const docs = parsePdefXml(SAMPLE_XML);
    expect(docs["GPS_TYPE"]).toEqual({ humanName: "GPS type", documentation: "GPS type selection" });
  });

  it("keeps the first definition when a param name is redefined (e.g. per-frame/backend)", () => {
    const docs = parsePdefXml(SAMPLE_XML);
    expect(docs["ATC_RAT_RLL_P"]?.documentation).toBe("Multirotor roll rate P gain");
  });

  it("returns an empty map for XML with no param elements", () => {
    expect(parsePdefXml("<paramfile></paramfile>")).toEqual({});
  });

  it("parses an enum param's <values> into a code->label map, including negative codes", () => {
    const docs = parsePdefXml(SAMPLE_XML);
    expect(docs["SERVO1_FUNCTION"]?.values).toEqual({ [-1]: "GPIO", 0: "Disabled", 4: "Aileron" });
  });

  it("omits the values key entirely for a non-enum param", () => {
    const docs = parsePdefXml(SAMPLE_XML);
    expect(docs["PILOT_THR_FILT"]).not.toHaveProperty("values");
  });

  it("parses a bitmask param's <bitmask> into a bit-index->label map", () => {
    const docs = parsePdefXml(SAMPLE_XML);
    expect(docs["FS_OPTIONS"]?.bitmask).toEqual({
      0: "Continue if in Auto on RC failsafe",
      1: "Continue if in Auto on GCS failsafe",
    });
  });

  it("omits the bitmask key entirely for a non-bitmask param", () => {
    const docs = parsePdefXml(SAMPLE_XML);
    expect(docs["PILOT_THR_FILT"]).not.toHaveProperty("bitmask");
  });
});

describe("vehicleFolderForMavType", () => {
  it("maps FIXED_WING to ArduPlane", () => {
    expect(vehicleFolderForMavType(MavType.FIXED_WING)).toBe("ArduPlane");
  });

  it("maps rover/boat types to Rover", () => {
    expect(vehicleFolderForMavType(MavType.GROUND_ROVER)).toBe("Rover");
    expect(vehicleFolderForMavType(MavType.SURFACE_BOAT)).toBe("Rover");
  });

  it("maps SUBMARINE to ArduSub", () => {
    expect(vehicleFolderForMavType(MavType.SUBMARINE)).toBe("ArduSub");
  });

  it("maps ANTENNA_TRACKER to AntennaTracker", () => {
    expect(vehicleFolderForMavType(MavType.ANTENNA_TRACKER)).toBe("AntennaTracker");
  });

  it("falls back to ArduCopter for multirotor types and anything else", () => {
    expect(vehicleFolderForMavType(MavType.QUADROTOR)).toBe("ArduCopter");
    expect(vehicleFolderForMavType(MavType.HEXAROTOR)).toBe("ArduCopter");
    expect(vehicleFolderForMavType(MavType.GENERIC)).toBe("ArduCopter");
  });
});

describe("paramDocsPageUrl", () => {
  it("builds a lowercased, hyphenated deep link for the given vehicle docs page", () => {
    expect(paramDocsPageUrl("ArduCopter", "PILOT_THR_FILT")).toBe(
      "https://ardupilot.org/copter/docs/parameters.html#pilot-thr-filt",
    );
  });

  it("uses the correct path segment per vehicle folder", () => {
    expect(paramDocsPageUrl("ArduSub", "FOO")).toContain("/sub/docs/parameters.html");
    expect(paramDocsPageUrl("AntennaTracker", "FOO")).toContain("/antennatracker/docs/parameters.html");
  });
});

describe("fetchParamDocs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("fetches and parses the pdef.xml for a vehicle folder not seen before", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SAMPLE_XML) });
    vi.stubGlobal("fetch", fetchMock);

    const docs = await fetchParamDocs("ArduPlane"); // dedicated folder - untouched by other tests
    expect(docs["PILOT_THR_FILT"]?.humanName).toBe("Throttle filter cutoff");
    expect(fetchMock).toHaveBeenCalledWith("https://autotest.ardupilot.org/Parameters/ArduPlane/apm.pdef.xml");
  });

  it("does not re-fetch on a second call for the same folder (in-memory cache)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SAMPLE_XML) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchParamDocs("Rover"); // dedicated folder
    await fetchParamDocs("Rover");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the fetch response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(fetchParamDocs("ArduSub")).rejects.toThrow(/404/); // dedicated folder
  });
});
