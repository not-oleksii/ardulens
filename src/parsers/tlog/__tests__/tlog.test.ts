import { describe, expect, it } from "vitest";
import {
  GlobalPositionInt,
  Heartbeat,
  MavAutopilot,
  MavModeFlag,
  MavState,
  MavSysStatusSensor,
  MavType,
  SysStatus,
  VfrHud,
} from "../../../mavlink/registry/registry";
import { TlogBuilder } from "../../../builders/TlogBuilder/TlogBuilder";
import { isParsedFlights, isParsedInfo } from "../../../types";
import { parseTlog } from "../tlog";

const SYSID = 1;
const COMPID = 1;
const EPOCH_START = 1_700_000_000_000; // an arbitrary but realistic wall-clock start (ms)

function heartbeat(armed: boolean, customMode = 0): Heartbeat {
  const hb = new Heartbeat();
  hb.type = MavType.QUADROTOR;
  hb.autopilot = MavAutopilot.ARDUPILOTMEGA;
  hb.baseMode = armed ? MavModeFlag.SAFETY_ARMED : (0 as MavModeFlag);
  hb.customMode = customMode;
  hb.systemStatus = armed ? MavState.ACTIVE : MavState.STANDBY;
  hb.mavlinkVersion = 3;
  return hb;
}

const NO_SENSORS = 0 as MavSysStatusSensor;

function sysStatus(voltageMv: number, currentCa: number): SysStatus {
  const s = new SysStatus();
  s.onboardControlSensorsPresent = NO_SENSORS;
  s.onboardControlSensorsEnabled = NO_SENSORS;
  s.onboardControlSensorsHealth = NO_SENSORS;
  s.load = 0;
  s.voltageBattery = voltageMv;
  s.currentBattery = currentCa;
  s.batteryRemaining = 80;
  s.dropRateComm = 0;
  s.errorsComm = 0;
  s.errorsCount1 = 0;
  s.errorsCount2 = 0;
  s.errorsCount3 = 0;
  s.errorsCount4 = 0;
  return s;
}

function vfrHud(airspeed: number, throttle: number): VfrHud {
  const v = new VfrHud();
  v.airspeed = airspeed;
  v.groundspeed = airspeed;
  v.heading = 0;
  v.throttle = throttle;
  v.alt = 0;
  v.climb = 0;
  return v;
}

function globalPositionInt(lat: number, lon: number, relAltM: number): GlobalPositionInt {
  const g = new GlobalPositionInt();
  g.timeBootMs = 0;
  g.lat = Math.round(lat * 1e7);
  g.lon = Math.round(lon * 1e7);
  g.alt = Math.round(relAltM * 1000);
  g.relativeAlt = Math.round(relAltM * 1000);
  g.vx = 0;
  g.vy = 0;
  g.vz = 0;
  g.hdg = 0;
  return g;
}

/** A realistic ~70s armed session (long enough to clear armWindows' 60s minimum), with
 *  battery/airspeed/throttle/position ticking every second, sandwiched between an initial
 *  disarmed heartbeat and a final one - so the arm/disarm transition is real, not assumed. */
function buildFlightTlog(): ArrayBuffer {
  const b = new TlogBuilder();
  let seq = 0;
  const meta = () => ({ seq: seq++, sysid: SYSID, compid: COMPID });

  b.addMessage(heartbeat(false), EPOCH_START, meta());
  b.addMessage(heartbeat(true, 5), EPOCH_START + 100, meta());
  for (let s = 0; s <= 70; s++) {
    const t = EPOCH_START + 200 + s * 1000;
    b.addMessage(sysStatus(16800 - s * 2, 520), t, meta());
    b.addMessage(vfrHud(15 + Math.sin(s) * 2, 60), t + 10, meta());
    b.addMessage(globalPositionInt(50.45 + s * 0.0001, 30.52 + s * 0.0001, 50 + s), t + 20, meta());
  }
  b.addMessage(heartbeat(false), EPOCH_START + 200 + 71_000, meta());
  return b.build();
}

describe("parseTlog", () => {
  it("returns an info result for a buffer with no recognizable MAVLink packets", () => {
    const result = parseTlog(new ArrayBuffer(16));
    expect(isParsedInfo(result)).toBe(true);
  });

  it("returns an info result when the vehicle is never armed long enough for a flight", () => {
    const b = new TlogBuilder();
    b.addMessage(heartbeat(false), EPOCH_START, { seq: 0, sysid: SYSID, compid: COMPID });
    b.addMessage(heartbeat(true), EPOCH_START + 1000, { seq: 1, sysid: SYSID, compid: COMPID }); // armed <1s
    b.addMessage(heartbeat(false), EPOCH_START + 2000, { seq: 2, sysid: SYSID, compid: COMPID });
    const result = parseTlog(b.build());
    expect(isParsedInfo(result)).toBe(true);
  });

  it("forceWholeFile shows the whole recording as one flight when never armed long enough", () => {
    const b = new TlogBuilder();
    b.addMessage(heartbeat(false), EPOCH_START, { seq: 0, sysid: SYSID, compid: COMPID });
    b.addMessage(heartbeat(true), EPOCH_START + 1000, { seq: 1, sysid: SYSID, compid: COMPID }); // armed <1s
    b.addMessage(heartbeat(false), EPOCH_START + 2000, { seq: 2, sysid: SYSID, compid: COMPID });

    const result = parseTlog(b.build(), "TestVehicle", { forceWholeFile: true });
    expect(isParsedFlights(result)).toBe(true);
    if (!isParsedFlights(result)) return;
    expect(result.flights).toHaveLength(1);
    expect(result.flights[0]!.samples.length).toBeGreaterThan(0);
  });

  it("parses one flight from a real armed window, with real decoded telemetry values", () => {
    const result = parseTlog(buildFlightTlog(), "TestVehicle");

    expect(isParsedFlights(result)).toBe(true);
    if (!isParsedFlights(result)) return;
    expect(result.flights).toHaveLength(1);
    expect(result.fmt).toBe("tlog");
    expect(result.boards).toEqual(["TestVehicle"]);

    const flight = result.flights[0]!;
    expect(flight.fmt).toBe("tlog");
    expect(flight.board).toBe("TestVehicle");
    expect(flight.timeReliable).toBe(true); // real wall-clock timestamps, unlike a dataflash .bin
    expect(flight.samples.length).toBeGreaterThan(0);

    const midSample = flight.samples[Math.floor(flight.samples.length / 2)]!;
    expect(midSample.voltage).toBeGreaterThan(15);
    expect(midSample.voltage).toBeLessThan(17);
    expect(midSample.current).toBeCloseTo(5.2, 1);
    expect(midSample.throttle).toBe(60);
    expect(typeof midSample.lat).toBe("number");
    expect(typeof midSample.lon).toBe("number");
    expect(midSample.mode).toBe(5);
  });

  it("defaults the board to '?' when none is given", () => {
    const result = parseTlog(buildFlightTlog());
    expect(isParsedFlights(result)).toBe(true);
    if (!isParsedFlights(result)) return;
    expect(result.boards).toEqual(["?"]);
  });
});
