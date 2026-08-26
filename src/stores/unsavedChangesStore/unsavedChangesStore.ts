import { create } from "zustand";

/** Whether the currently-mounted view has local state that would be silently discarded by
 *  some navigation-like action - originally ArduPilot Setup's own sections (unmounted on
 *  sidebar-section switch, see ArduPilotSetupView.tsx's section-rendering ternary, so any
 *  component-local state like ParametersPanel's staged pendingChanges is lost with it), now
 *  also the offline log viewer's GeoTagView (a picked photo folder, lost if "Change file" is
 *  clicked - see Sidebar.tsx). A view sets this true while it has state worth protecting and
 *  clears it on save/unmount; the action that would discard it reads this first and confirms
 *  before proceeding instead of silently doing so. */
interface UnsavedChangesState {
  hasUnsaved: boolean;
  setUnsaved: (hasUnsaved: boolean) => void;
}

export const useUnsavedChangesStore = create<UnsavedChangesState>((set) => ({
  hasUnsaved: false,
  setUnsaved: (hasUnsaved) => set({ hasUnsaved }),
}));
