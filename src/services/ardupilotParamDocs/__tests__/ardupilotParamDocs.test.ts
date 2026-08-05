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
    });
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
