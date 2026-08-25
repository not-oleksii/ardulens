import { create } from "zustand";

/** Whether the currently-mounted ArduPilot Setup section has local edits that would be
 *  silently discarded if the user switches to a different sidebar section - sections are
 *  fully unmounted on switch (see ArduPilotSetupView.tsx's section-rendering ternary), so any
 *  component-local state (e.g. ParametersPanel's staged pendingChanges) is lost with it. A
 *  section sets this true while it has unsaved edits and clears it on save/unmount;
 *  ArduPilotSetupView reads it before actually switching sections. */
interface UnsavedChangesState {
  hasUnsaved: boolean;
  setUnsaved: (hasUnsaved: boolean) => void;
}

export const useUnsavedChangesStore = create<UnsavedChangesState>((set) => ({
  hasUnsaved: false,
  setUnsaved: (hasUnsaved) => set({ hasUnsaved }),
}));
