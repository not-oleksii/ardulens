import { create } from "zustand";
import type { FileState } from "./types";

/**
 * The single file loaded via the home screen, shared by every tab - Logs/Graphs/Map each
 * derive their own view-model from it lazily (see useDerivedFromFile) instead of each
 * owning a separate upload.
 */
export const useFileStore = create<FileState>((set) => ({
  file: null,
  setFile: (file) => set({ file }),
  clearFile: () => set({ file: null }),
}));
