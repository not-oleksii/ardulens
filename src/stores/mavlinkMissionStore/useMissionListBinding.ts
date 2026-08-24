import type { StoreApi, UseBoundStore } from "zustand";
import type { MavlinkMissionState } from "./types";

/** Subscribes to every field of a MISSION_ITEM_INT-shaped list store (see
 *  createMissionListStore.ts) at once - shared by the mission/fence/rally panels in
 *  ArduPilotSetupView.tsx so each only needs one call instead of 16 individual selectors. */
export function useMissionListBinding(useStore: UseBoundStore<StoreApi<MavlinkMissionState>>) {
  const items = useStore((s) => s.items);
  const downloadPhase = useStore((s) => s.downloadPhase);
  const downloadCountExpected = useStore((s) => s.downloadCountExpected);
  const downloadError = useStore((s) => s.downloadError);
  const uploadPhase = useStore((s) => s.uploadPhase);
  const uploadError = useStore((s) => s.uploadError);
  const setItems = useStore((s) => s.setItems);
  return { items, downloadPhase, downloadCountExpected, downloadError, uploadPhase, uploadError, setItems };
}

export type MissionListBinding = ReturnType<typeof useMissionListBinding>;
