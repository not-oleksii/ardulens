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
  /** Whether the altitude column is meaningful - defaults to `usesPosition` when omitted. Only
   *  fence vertex/circle commands set this false: ArduPilot's simple fence is a 2D horizontal
   *  boundary, so `z` is sent but never interpreted (see FENCE_COMMANDS below). */
  usesAltitude?: boolean;
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

/** Real param semantics confirmed against ArduPilot's own firmware source
 *  (GCS_MAVLink/MissionItemProtocol_Fence.cpp's mission_item-to-AC_PolyFenceItem conversion), not
 *  MAVLink's common.xml alone (which just marks every fence param "Reserved" and says nothing
 *  ArduPilot-specific): param1 carries the polygon's running vertex count for the two
 *  POLYGON_VERTEX commands, or the circle radius (m) for the two CIRCLE commands - fence items
 *  carry no meaningful altitude (ArduPilot's simple fence is a 2D horizontal boundary). */
export const FENCE_COMMANDS: readonly MissionCommandConfig[] = [
  {
    command: MavCmd.NAV_FENCE_POLYGON_VERTEX_INCLUSION,
    labelKey: "fencePolygonVertexInclusion",
    paramLabelKeys: ["vertexCount", null, null, null],
    usesPosition: true,
    usesAltitude: false,
  },
  {
    command: MavCmd.NAV_FENCE_POLYGON_VERTEX_EXCLUSION,
    labelKey: "fencePolygonVertexExclusion",
    paramLabelKeys: ["vertexCount", null, null, null],
    usesPosition: true,
    usesAltitude: false,
  },
  {
    command: MavCmd.NAV_FENCE_CIRCLE_INCLUSION,
    labelKey: "fenceCircleInclusion",
    paramLabelKeys: ["radius", null, null, null],
    usesPosition: true,
    usesAltitude: false,
  },
  {
    command: MavCmd.NAV_FENCE_CIRCLE_EXCLUSION,
    labelKey: "fenceCircleExclusion",
    paramLabelKeys: ["radius", null, null, null],
    usesPosition: true,
    usesAltitude: false,
  },
  {
    command: MavCmd.NAV_FENCE_RETURN_POINT,
    labelKey: "fenceReturnPoint",
    paramLabelKeys: [null, null, null, null],
    usesPosition: true,
    usesAltitude: false,
  },
];

/** Real param semantics confirmed against ArduPilot's own firmware source
 *  (GCS_MAVLink/MissionItemProtocol_Rally.cpp's mission_item-to-RallyLocation conversion): only
 *  x/y/z (lat/lon/alt) are read - param1-4 are genuinely unused by current ArduPilot firmware,
 *  matching (not contradicting) MAVLink common.xml's own "Reserved" marking for this command. */
export const RALLY_COMMANDS: readonly MissionCommandConfig[] = [
  {
    command: MavCmd.NAV_RALLY_POINT,
    labelKey: "navRallyPoint",
    paramLabelKeys: [null, null, null, null],
    usesPosition: true,
  },
];

const FALLBACK_CONFIG: MissionCommandConfig = {
  command: -1,
  labelKey: "unknownCommand",
  paramLabelKeys: ["param1", "param2", "param3", "param4"],
  usesPosition: true,
};

/** Falls back to a generic raw-param display for any command not in the given curated list -
 *  a real vehicle's mission/fence/rally list can reference commands this app doesn't have
 *  bespoke labels for yet, and those items must stay editable, not disappear or break. */
export function commandConfig(command: number, commands: readonly MissionCommandConfig[] = MISSION_COMMANDS): MissionCommandConfig {
  return commands.find((c) => c.command === command) ?? { ...FALLBACK_CONFIG, command };
}
