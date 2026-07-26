import { describe, expect, it } from "vitest";
import { parseSkylog } from "../skylog";
import { isParsedError, isParsedFlights } from "../../../types";

function toBuf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

const board1 = [
  "{setid:3570}",
  '{telemetry:"time:1000,armed:1,voltage:25.0,current:5,airspeed:12,throttle:80,alt:50,lat:50.0001,lon:30.0001,mode:5"}',
  '{telemetry:"time:2000,armed:1,voltage:24.5,current:8,airspeed:14,throttle:100,alt:80,lat:50.0002,lon:30.0002,mode:5"}',
  '{telemetry:"time:3000,armed:0,voltage:24.0,current:0,airspeed:0,throttle:0,alt:0,lat:50.0002,lon:30.0002,mode:0"}',
].join("\n");

const board2 = [
  "{setid:3526}",
  '{telemetry:"time:4000,armed:1,voltage:25.2,current:6,airspeed:13,throttle:90,alt:60,lat:51.0001,lon:31.0001,mode:4"}',
  '{telemetry:"time:5000,armed:1,voltage:24.8,current:10,airspeed:16,throttle:100,alt:90,lat:51.0002,lon:31.0002,mode:4"}',
  '{telemetry:"time:6000,armed:0,voltage:24.2,current:0,airspeed:0,throttle:0,alt:0,lat:51.0002,lon:31.0002,mode:0"}',
].join("\n");

describe("parseSkylog", () => {
  it("splits telemetry into one flight per board", () => {
    const result = parseSkylog(toBuf(`${board1}\n${board2}`));
    expect(isParsedFlights(result)).toBe(true);
    if (!isParsedFlights(result)) return;

    expect(result.fmt).toBe("skylog");
    expect(result.flights).toHaveLength(2);
    expect(result.boards.sort()).toEqual(["3526", "3570"]);
    expect(result.flights.every((f) => f.timeReliable)).toBe(true);
  });

  it("keeps spoofing-resistant lat/lon over raw gps_lat/gps_lon when both are present", () => {
    const text = [
      "{setid:1}",
      '{telemetry:"time:1000,armed:1,alt:50,airspeed:12,lat:10.0,lon:20.0,gps_lat:99.0,gps_lon:99.0"}',
      '{telemetry:"time:2000,armed:1,alt:80,airspeed:14,lat:10.001,lon:20.001,gps_lat:99.0,gps_lon:99.0"}',
    ].join("\n");
    const result = parseSkylog(toBuf(text));
    expect(isParsedFlights(result)).toBe(true);
    if (!isParsedFlights(result)) return;
    expect(result.flights[0]!.samples[0]!.lat).toBe(10.0);
  });

  it("drops armed segments that never actually got airborne", () => {
    const text = [
      "{setid:1}",
      '{telemetry:"time:1000,armed:1,alt:2,airspeed:1"}',
      '{telemetry:"time:2000,armed:1,alt:3,airspeed:1"}',
    ].join("\n");
    const result = parseSkylog(toBuf(text));
    expect(isParsedFlights(result)).toBe(true);
    if (!isParsedFlights(result)) return;
    expect(result.flights).toHaveLength(0);
  });

  it("errors when only raw {tlm:...} is present (missing -extended_log)", () => {
    const result = parseSkylog(toBuf('{tlm:"time:1000,armed:1"}'));
    expect(isParsedError(result)).toBe(true);
    if (!isParsedError(result)) return;
    expect(result.error).toMatch(/-extended_log/);
  });

  it("errors when the file has no telemetry at all", () => {
    const result = parseSkylog(toBuf("just some unrelated log text"));
    expect(isParsedError(result)).toBe(true);
    if (!isParsedError(result)) return;
    expect(result.error).toMatch(/телеметрії/);
  });
});
