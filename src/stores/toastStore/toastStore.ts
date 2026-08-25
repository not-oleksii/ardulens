import { create } from "zustand";
import type { ToastState } from "./types";

const DEFAULT_DURATION_MS = 4000;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (item) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { ...item, id, duration: item.duration ?? DEFAULT_DURATION_MS }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire-and-forget helper for call sites that don't otherwise need the store (the common
 *  case - a command handler firing one confirmation/error toast) - mirrors this codebase's
 *  own convention of calling `useXStore.getState().action(...)` directly rather than requiring
 *  every caller to subscribe via the hook. Returns the toast's id, e.g. to dismiss it early. */
export function toast(item: Parameters<ToastState["push"]>[0]): string {
  return useToastStore.getState().push(item);
}
