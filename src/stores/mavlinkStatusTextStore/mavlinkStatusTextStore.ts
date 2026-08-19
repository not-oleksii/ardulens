import { create } from "zustand";
import type { MavlinkStatusTextState } from "./types";

// A real vehicle can chatter continuously (e.g. repeated "PreArm: ..." while disarmed) - capped
// so a long session's message list doesn't grow unbounded.
const MAX_MESSAGES = 50;

export const useMavlinkStatusTextStore = create<MavlinkStatusTextState>((set) => ({
  messages: [],
  addMessage: (entry) => set((s) => ({ messages: [entry, ...s.messages].slice(0, MAX_MESSAGES) })),
  reset: () => set({ messages: [] }),
}));
