import { create } from "zustand";
import type { MavlinkParameterState } from "./types";

export const useMavlinkParameterStore = create<MavlinkParameterState>((set) => ({
  params: {},
  expectedCount: null,
  setParam: (entry, expectedCount) =>
    set((s) => ({ params: { ...s.params, [entry.name]: entry }, expectedCount })),
  setParams: (entries, expectedCount) =>
    set((s) => {
      if (entries.length === 0) return s;
      const params = { ...s.params };
      for (const entry of entries) params[entry.name] = entry;
      return { params, expectedCount };
    }),
  markDirty: (name, dirty) =>
    set((s) => {
      const existing = s.params[name];
      if (!existing) return s;
      return { params: { ...s.params, [name]: { ...existing, dirty } } };
    }),
  reset: () => set({ params: {}, expectedCount: null }),
}));
