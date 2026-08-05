import type { MavParamType } from "../../mavlink/registry/registry";

export interface ParamEntry {
  name: string;
  value: number;
  type: MavParamType;
  index: number;
  updatedAt: number;
  /** True from the moment a local PARAM_SET is sent until the vehicle's next PARAM_VALUE for this name arrives. */
  dirty: boolean;
}

export interface MavlinkParameterState {
  params: Record<string, ParamEntry>;
  /** The vehicle's own reported total parameter count (from PARAM_VALUE's param_count), or null until the first one arrives. */
  expectedCount: number | null;
  setParam: (entry: ParamEntry, expectedCount: number) => void;
  /** Merges many entries into `params` in one state update - used to flush a batch of
   *  incoming PARAM_VALUE packets at once, instead of one React re-render per packet, which
   *  is what makes loading a full (1000+ param) list freeze the UI. */
  setParams: (entries: ParamEntry[], expectedCount: number) => void;
  markDirty: (name: string, dirty: boolean) => void;
  reset: () => void;
}
