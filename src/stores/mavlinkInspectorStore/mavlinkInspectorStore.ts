import { create } from "zustand";
import type { MavlinkInspectorState } from "./types";

export const useMavlinkInspectorStore = create<MavlinkInspectorState>((set) => ({
  entries: {},
  recordPacket: (msgId, name, message, receivedAt) =>
    set((s) => {
      const prev = s.entries[msgId];
      return {
        entries: {
          ...s.entries,
          [msgId]: {
            msgId,
            name,
            count: (prev?.count ?? 0) + 1,
            hz: prev?.hz ?? 0,
            countAtLastTick: prev?.countAtLastTick ?? 0,
            lastMessage: message,
            lastReceivedAt: receivedAt,
          },
        },
      };
    }),
  tickRates: () =>
    set((s) => {
      const entries: MavlinkInspectorState["entries"] = {};
      for (const [id, entry] of Object.entries(s.entries)) {
        entries[Number(id)] = { ...entry, hz: entry.count - entry.countAtLastTick, countAtLastTick: entry.count };
      }
      return { entries };
    }),
  reset: () => set({ entries: {} }),
}));
