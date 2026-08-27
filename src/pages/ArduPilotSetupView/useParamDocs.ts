import { useEffect, useState } from "react";
import { fetchParamDocs, type ArduPilotVehicleFolder, type ParamDocsMap } from "../../services/ardupilotParamDocs/ardupilotParamDocs";

interface ParamDocsResult {
  docs: ParamDocsMap | null;
  docsLoading: boolean;
  docsFailed: boolean;
}

/**
 * Fetches a vehicle family's parameter documentation - fetchParamDocs is already cached
 * per-folder (in-memory + localStorage), so calling this from several sections for the same
 * folder costs nothing extra. Tags the result with the folder it's for so a stale result from a
 * previously loaded vehicle type is never shown while a new folder's fetch is still in flight.
 * Pass null to skip fetching entirely (e.g. a section that only wants docs for one specific
 * vehicle family, gated on some other condition).
 */
export function useParamDocs(folder: ArduPilotVehicleFolder | null): ParamDocsResult {
  const [docsState, setDocsState] = useState<{ folder: ArduPilotVehicleFolder; docs: ParamDocsMap } | null>(null);
  const [docsErrorFolder, setDocsErrorFolder] = useState<ArduPilotVehicleFolder | null>(null);

  useEffect(() => {
    if (!folder) return;
    let cancelled = false;
    fetchParamDocs(folder)
      .then((result) => {
        if (!cancelled) setDocsState({ folder, docs: result });
      })
      .catch(() => {
        // Descriptions/enum labels are a nice-to-have enhancement everywhere this hook is used -
        // the raw param list/codes still work without them, but the failure is surfaced (rather
        // than silently doing nothing) so a real fetch problem is visible.
        if (!cancelled) setDocsErrorFolder(folder);
      });
    return () => {
      cancelled = true;
    };
  }, [folder]);

  const docs = docsState?.folder === folder ? docsState.docs : null;
  const docsFailed = docsErrorFolder === folder;
  const docsLoading = folder !== null && !docs && !docsFailed;

  return { docs, docsLoading, docsFailed };
}
