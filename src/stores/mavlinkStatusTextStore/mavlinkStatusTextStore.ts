import { create } from "zustand";
import type { MavlinkStatusTextState } from "./types";

// A real vehicle can chatter continuously (e.g. repeated "PreArm: ..." while disarmed) - capped
// so a long session's message list doesn't grow unbounded. Large enough that TelemetrySection's
// compact, scrollable Messages tab (under the PFD) still retains a genuinely useful session's
// worth of history - each entry is just a short string plus two numbers, a trivial footprint.
const MAX_MESSAGES = 300;

export const useMavlinkStatusTextStore = create<MavlinkStatusTextState>((set) => ({
  messages: [],
  addMessage: (entry) => set((s) => ({ messages: [entry, ...s.messages].slice(0, MAX_MESSAGES) })),
  reset: () => set({ messages: [] }),
}));
