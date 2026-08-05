import { create } from "zustand";
import type { MavlinkParameterState } from "./types";

export const useMavlinkParameterStore = create<MavlinkParameterState>((set) => ({
  params: {},
  expectedCount: null,
  setParam: (entry, expectedCount) =>
    set((s) => ({ params: { ...s.params, [entry.name]: entry }, expectedCount })),
  markDirty: (name, dirty) =>
    set((s) => {
      const existing = s.params[name];
      if (!existing) return s;
      return { params: { ...s.params, [name]: { ...existing, dirty } } };
    }),
  reset: () => set({ params: {}, expectedCount: null }),
}));
