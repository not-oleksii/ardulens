import { describe, expect, it } from "vitest";
import { DoStartMagCalCommand, GlobalPositionInt, Heartbeat, MagCalProgress, MagCalReport, MAVLINK_REGISTRY, ParamValue } from "../registry";

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

  it("maps mag-cal message ids (MAG_CAL_PROGRESS from ardupilotmega, MAG_CAL_REPORT from common)", () => {
    expect(MAVLINK_REGISTRY[191]).toBe(MagCalProgress);
    expect(MAVLINK_REGISTRY[192]).toBe(MagCalReport);
  });

  it("DO_START_MAG_CAL is a COMMAND_LONG (msg 76) wrapper with its command field pre-set", () => {
    expect(DoStartMagCalCommand.MSG_ID).toBe(76);
    expect(new DoStartMagCalCommand().command).toBe(42424); // MAV_CMD_DO_START_MAG_CAL
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
