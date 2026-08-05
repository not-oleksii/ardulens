import { describe, expect, it } from "vitest";
import { GlobalPositionInt, Heartbeat, MAVLINK_REGISTRY, ParamValue } from "../registry";

describe("MAVLINK_REGISTRY", () => {
  it("maps message id 0 to the Heartbeat class", () => {
    expect(MAVLINK_REGISTRY[0]).toBe(Heartbeat);
  });

  it("combines minimal, common, standard, and ardupilotmega dialects into one registry", () => {
    // A sampling of message ids from each of the four merged dialects.
    expect(MAVLINK_REGISTRY[0]).toBeDefined(); // HEARTBEAT (minimal)
    expect(MAVLINK_REGISTRY[1]).toBeDefined(); // SYS_STATUS (common)
    expect(MAVLINK_REGISTRY[33]).toBe(GlobalPositionInt); // GLOBAL_POSITION_INT (standard)
    expect(MAVLINK_REGISTRY[150]).toBeDefined(); // SENSOR_OFFSETS (ardupilotmega)
    expect(MAVLINK_REGISTRY[22]).toBe(ParamValue); // PARAM_VALUE (common)
  });

  it("Heartbeat carries the field metadata needed to decode/encode it", () => {
    expect(Heartbeat.MSG_ID).toBe(0);
    expect(Heartbeat.MAGIC_NUMBER).toBe(50);
    expect(Heartbeat.FIELDS.map((f) => f.name)).toEqual([
      "customMode",
      "type",
      "autopilot",
      "baseMode",
      "systemStatus",
      "mavlinkVersion",
    ]);
  });
});
