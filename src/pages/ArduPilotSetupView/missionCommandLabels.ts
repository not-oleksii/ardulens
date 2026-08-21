import { MavCmd } from "../../mavlink/registry/registry";

/** Which of a mission item's 4 generic params/lat/lon/alt fields are actually meaningful for a
 *  given command, and what each param means - real semantics confirmed against MAVLink's own
 *  common.xml (<enum name="MAV_CMD"> entries for each of these), not guessed. `null` in the
 *  params array means that slot is unused by this command (still sent as 0 on the wire, but not
 *  worth showing/editing). Mirrors the same "spreadsheet-style generic param grid, labels change
 *  per selected command" approach Mission Planner's own Flight Plan screen uses, rather than a
 *  bespoke form layout per command. */
export interface MissionCommandConfig {
  command: number;
  labelKey: string;
  /** i18n keys for param1-4, or null if that param is unused by this command. */
  paramLabelKeys: [string | null, string | null, string | null, string | null];
  usesPosition: boolean;
}

export const MISSION_COMMANDS: readonly MissionCommandConfig[] = [
  {
    command: MavCmd.NAV_WAYPOINT,
    labelKey: "navWaypoint",
    paramLabelKeys: ["holdTime", "acceptRadius", "passRadius", "yaw"],
    usesPosition: true,
  },
  {
    command: MavCmd.NAV_LOITER_UNLIM,
    labelKey: "navLoiterUnlim",
    paramLabelKeys: [null, null, "radius", "yaw"],
    usesPosition: true,
  },
  {
    command: MavCmd.NAV_LOITER_TURNS,
    labelKey: "navLoiterTurns",
    paramLabelKeys: ["turns", null, "radius", "yaw"],
    usesPosition: true,
  },
  {
    command: MavCmd.NAV_LOITER_TIME,
    labelKey: "navLoiterTime",
    paramLabelKeys: ["holdTime", null, "radius", "yaw"],
    usesPosition: true,
  },
  {
    command: MavCmd.NAV_RETURN_TO_LAUNCH,
    labelKey: "navReturnToLaunch",
    paramLabelKeys: [null, null, null, null],
    usesPosition: false,
  },
  {
    command: MavCmd.NAV_LAND,
    labelKey: "navLand",
    paramLabelKeys: ["abortAlt", null, null, "yaw"],
    usesPosition: true,
  },
  {
    command: MavCmd.NAV_TAKEOFF,
    labelKey: "navTakeoff",
    paramLabelKeys: ["pitch", null, null, "yaw"],
    usesPosition: true,
  },
  {
    command: MavCmd.DO_JUMP,
    labelKey: "doJump",
    paramLabelKeys: ["targetSeq", "repeatCount", null, null],
    usesPosition: false,
  },
];

const FALLBACK_CONFIG: MissionCommandConfig = {
  command: -1,
  labelKey: "unknownCommand",
  paramLabelKeys: ["param1", "param2", "param3", "param4"],
  usesPosition: true,
};

/** Falls back to a generic raw-param display for any command not in the curated list above -
 *  a real vehicle's mission can reference commands this app doesn't have bespoke labels for yet
 *  (e.g. DO_SET_CAM_TRIGG_DIST), and those items must stay editable, not disappear or break. */
export function missionCommandConfig(command: number): MissionCommandConfig {
  return MISSION_COMMANDS.find((c) => c.command === command) ?? { ...FALLBACK_CONFIG, command };
}
