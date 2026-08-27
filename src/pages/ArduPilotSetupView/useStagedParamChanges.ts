import { useCallback, useEffect, useState } from "react";
import type { MavParamType } from "../../mavlink/registry/registry";
import type { ParamEntry } from "../../stores/mavlinkParameterStore/types";
import { useUnsavedChangesStore } from "../../stores/unsavedChangesStore/unsavedChangesStore";

interface UseStagedParamChangesOptions {
  params: Record<string, ParamEntry>;
  onSetParam: (name: string, value: number, type: MavParamType) => void;
  /** Wires hasPendingChanges into the shared unsaved-changes guard (the tab-switch/"Change
   *  file" confirm) - only some sections using this hook currently opt into that guard, so pass
   *  true to match a section's existing behavior rather than changing it. */
  trackUnsaved?: boolean;
}

/**
 * The stage-then-confirm param-editing pattern shared by every param-editing section in this
 * app (ParametersPanel, ParameterTreeSection, PidTuneSection, and the per-vehicle config
 * sections): edits are staged in `pendingChanges` (keyed by param name) rather than sent
 * immediately, so the user can review a single From/To list before anything reaches the
 * vehicle. A staged value that matches the param's current value un-stages itself, so
 * `pendingChanges` only ever holds real, pending edits.
 */
export function useStagedParamChanges({ params, onSetParam, trackUnsaved }: UseStagedParamChangesOptions) {
  const [pendingChanges, setPendingChanges] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const pendingEntries = Object.entries(pendingChanges);
  const hasPendingChanges = pendingEntries.length > 0;

  useEffect(() => {
    if (!trackUnsaved) return;
    useUnsavedChangesStore.getState().setUnsaved(hasPendingChanges);
    return () => useUnsavedChangesStore.getState().setUnsaved(false);
  }, [trackUnsaved, hasPendingChanges]);

  // useCallback (not a plain function) so it stays referentially stable across re-renders that
  // don't actually change `params` - RcSetupSection's ChannelFunctionSelect, for one, depends on
  // this for its own memo to bail out on the section's 10Hz live-PWM re-renders.
  const stageChange = useCallback(
    (name: string, value: number) => {
      const original = params[name]?.value;
      setPendingChanges((prev) => {
        const next = { ...prev };
        if (original !== undefined && value === original) {
          delete next[name]; // editing back to the original value un-stages it
        } else {
          next[name] = value;
        }
        return next;
      });
    },
    [params],
  );

  function resetAll() {
    setPendingChanges({});
  }

  function confirmSaveAll() {
    for (const [name, value] of pendingEntries) {
      const type = params[name]?.type;
      if (type !== undefined) onSetParam(name, value, type);
    }
    setPendingChanges({});
    setConfirmOpen(false);
  }

  return {
    pendingChanges,
    setPendingChanges,
    pendingEntries,
    hasPendingChanges,
    confirmOpen,
    setConfirmOpen,
    stageChange,
    resetAll,
    confirmSaveAll,
  };
}
