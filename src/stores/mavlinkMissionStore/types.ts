export type MissionTransferPhase = "idle" | "active" | "done" | "error";

/** One row of a mission/fence/rally list - mirrors MISSION_ITEM_INT's own fields, with lat/lon
 *  kept as real degrees (not the wire's int32 * 1e7) for direct use in the UI/map. */
export interface MissionItemEntry {
  seq: number;
  /** MavCmd - which command this item is (NAV_WAYPOINT, NAV_RETURN_TO_LAUNCH, DO_JUMP, etc). */
  command: number;
  /** MavFrame - almost always GLOBAL_RELATIVE_ALT for a real mission. */
  frame: number;
  autocontinue: boolean;
  param1: number;
  param2: number;
  param3: number;
  param4: number;
  lat: number;
  lon: number;
  alt: number;
}

export interface MavlinkMissionState {
  items: MissionItemEntry[];
  downloadPhase: MissionTransferPhase;
  /** From MISSION_COUNT, once known - how many items the download should end up with. */
  downloadCountExpected: number | null;
  downloadError: string | null;
  uploadPhase: MissionTransferPhase;
  uploadError: string | null;
  /** Marks a download as in progress from the moment the request is sent - MISSION_COUNT (and
   *  so the real expected item count) hasn't necessarily arrived yet, so an unrelated
   *  MISSION_ACK arriving before it (a real rejection path, see registry.ts's mission comment)
   *  is still recognizable as "happened during a download," not silently ignored. */
  beginDownload: () => void;
  setDownloadCountExpected: (countExpected: number) => void;
  receiveDownloadedItem: (item: MissionItemEntry) => void;
  finishDownload: () => void;
  failDownload: (error: string) => void;
  setItems: (items: MissionItemEntry[]) => void;
  startUpload: () => void;
  finishUpload: () => void;
  failUpload: (error: string) => void;
  reset: () => void;
}
