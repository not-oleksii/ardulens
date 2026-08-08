import { create } from "zustand";
import type { MavlinkRcCalState } from "./types";

const INITIAL = {
  live: {},
  chanCount: 0,
  active: false,
  channels: {},
  lastCommandAck: null,
} as const;

export const useMavlinkRcCalStore = create<MavlinkRcCalState>((set) => ({
  ...INITIAL,
  start: () => set({ active: true, channels: {} }),
  observe: (raw, chanCount) =>
    set((s) => {
      const live = { ...s.live, ...raw };
      if (!s.active) return { live, chanCount };
      const channels = { ...s.channels };
      for (const [channelKey, value] of Object.entries(raw)) {
        const channel = Number(channelKey);
        const existing = channels[channel];
        channels[channel] = existing
          ? {
              ...existing,
              min: Math.min(existing.min, value),
              max: Math.max(existing.max, value),
            }
          : { min: value, max: value, trim: value, reversed: false };
      }
      return { live, chanCount, channels };
    }),
  toggleReversed: (channel) =>
    set((s) => {
      const existing = s.channels[channel];
      if (!existing) return {};
      return { channels: { ...s.channels, [channel]: { ...existing, reversed: !existing.reversed } } };
    }),
  setLastCommandAck: (lastCommandAck) => set({ lastCommandAck }),
  stop: () => set({ active: false, channels: {} }),
  reset: () => set({ ...INITIAL }),
}));
