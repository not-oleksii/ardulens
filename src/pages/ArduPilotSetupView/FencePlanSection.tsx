import { ChevronUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CESIUM_TOKEN_STORAGE_KEY } from "../../constants";
import { MavCmd, MavFrame } from "../../mavlink/registry/registry";
import type { MissionItemEntry, MissionTransferPhase } from "../../stores/mavlinkMissionStore/types";
import { commandConfig, FENCE_COMMANDS } from "./missionCommandLabels";
import { useMissionMapViewer } from "./useMissionMapViewer";

const MARKER_COLOR = "#ef4444";
const PATH_COLOR = "#ef4444";

interface FencePlanSectionProps {
  items: MissionItemEntry[];
  downloadPhase: MissionTransferPhase;
  downloadCountExpected: number | null;
  downloadError: string | null;
  uploadPhase: MissionTransferPhase;
  uploadError: string | null;
  onDownload: () => void;
  onUpload: () => void;
  onSetItems: (items: MissionItemEntry[]) => void;
}

/** ArduPilot's fence's polygon vertex count is a per-item wire field (param1), not something the
 *  vehicle infers from how many vertices arrived - real firmware source (see the doc comment on
 *  FENCE_COMMANDS in missionCommandLabels.ts) confirms it's read back off each vertex item. Kept
 *  in sync here after every local edit so an upload always carries a consistent count, matching
 *  what Mission Planner's own polygon fence editor does automatically. Exclusion vertices are
 *  counted separately from inclusion ones, since ArduPilot tracks them as independent polygons. */
// `MissionItemEntry.command` is a plain `number` (it mirrors the wire field, which can be any
// vehicle-reported value - see its own doc comment), so these are compared as numbers rather
// than against MavCmd's own (enum-typed) members directly.
const INCLUSION_COMMAND: number = MavCmd.NAV_FENCE_POLYGON_VERTEX_INCLUSION;
const EXCLUSION_COMMAND: number = MavCmd.NAV_FENCE_POLYGON_VERTEX_EXCLUSION;

function recomputeFenceVertexCounts(items: MissionItemEntry[]): MissionItemEntry[] {
  const inclusionCount = items.filter((i) => i.command === INCLUSION_COMMAND).length;
  const exclusionCount = items.filter((i) => i.command === EXCLUSION_COMMAND).length;
  return items.map((i) => {
    if (i.command === INCLUSION_COMMAND) return { ...i, param1: inclusionCount };
    if (i.command === EXCLUSION_COMMAND) return { ...i, param1: exclusionCount };
    return i;
  });
}

/** Geofence editor - the same map-click-to-add-point / table-editor pattern as MissionPlanSection
 *  (both are lists of MISSION_ITEM_INT-shaped points, see useMissionMapViewer.ts), but scoped to
 *  a single inclusion polygon for this first release rather than Mission Planner's full
 *  inclusion+exclusion+circle+return-point editor - the single-boundary case is the common one,
 *  and downloaded fences using the other fence commands still display/edit correctly via the
 *  generic command dropdown/param grid, just without the vertex-count auto-maintenance a second
 *  polygon would need. File save/load (Mission Planner's own fence file formats aren't documented
 *  clearly/consistently enough to implement with confidence - see commit notes) is deliberately
 *  left for a later pass; live download/upload to the vehicle is the actual gap being closed. */
export function FencePlanSection({
  items,
  downloadPhase,
  downloadCountExpected,
  downloadError,
  uploadPhase,
  uploadError,
  onDownload,
  onUpload,
  onSetItems,
}: FencePlanSectionProps) {
  const { t } = useTranslation();
  const [token, setToken] = useState(() => localStorage.getItem(CESIUM_TOKEN_STORAGE_KEY) ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  function saveToken() {
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    localStorage.setItem(CESIUM_TOKEN_STORAGE_KEY, trimmed);
    setToken(trimmed);
  }

  function commit(nextItems: MissionItemEntry[]) {
    onSetItems(recomputeFenceVertexCounts(nextItems));
  }

  function addVertex(lat: number, lon: number) {
    const seq = items.length;
    commit([
      ...items,
      { seq, command: MavCmd.NAV_FENCE_POLYGON_VERTEX_INCLUSION, frame: MavFrame.GLOBAL, autocontinue: true, param1: 0, param2: 0, param3: 0, param4: 0, lat, lon, alt: 0 },
    ]);
  }

  const { containerRef } = useMissionMapViewer({
    token,
    items,
    markerColor: MARKER_COLOR,
    pathColor: PATH_COLOR,
    pathStyle: "closedPolygon",
    onMapClick: (lat, lon) => addVertex(lat, lon),
  });

  function updateItem(seq: number, patch: Partial<MissionItemEntry>) {
    commit(items.map((i) => (i.seq === seq ? { ...i, ...patch } : i)));
  }

  function deleteItem(seq: number) {
    commit(items.filter((i) => i.seq !== seq).map((i, index) => ({ ...i, seq: index })));
  }

  function handleAddVertex() {
    const last = items[items.length - 1];
    addVertex(last?.lat ?? 0, last?.lon ?? 0);
  }

  function handleClearAll() {
    setConfirmClearOpen(false);
    onSetItems([]);
  }

  const downloading = downloadPhase === "active";
  const uploading = uploadPhase === "active";

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.fence.heading")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onDownload} disabled={downloading || uploading}>
            {t("ardupilotSetup.missionPlan.download")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onUpload} disabled={items.length === 0 || downloading || uploading}>
            {t("ardupilotSetup.missionPlan.upload")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={handleAddVertex}>
            {t("ardupilotSetup.fence.addVertex")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmClearOpen(true)} disabled={items.length === 0}>
            {t("ardupilotSetup.missionPlan.clearAll")}
          </Button>
        </div>
      </div>

      {downloading && (
        <p className="text-xs text-muted-foreground">
          {t("ardupilotSetup.missionPlan.downloading", { received: items.length, total: downloadCountExpected ?? "?" })}
        </p>
      )}
      {downloadPhase === "error" && downloadError && (
        <Alert variant="destructive"><AlertDescription>{downloadError}</AlertDescription></Alert>
      )}
      {uploading && <p className="text-xs text-muted-foreground">{t("ardupilotSetup.missionPlan.uploading")}</p>}
      {uploadPhase === "error" && uploadError && (
        <Alert variant="destructive"><AlertDescription>{uploadError}</AlertDescription></Alert>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        {token ? (
          <div ref={containerRef} data-testid="fence-map" className="absolute inset-0" />
        ) : (
          <div className="absolute inset-0 overflow-y-auto p-3">
            <Alert variant="info">
              <AlertDescription>
                {t("map.token.intro")}{" "}
                <a href="https://ion.cesium.com/tokens" target="_blank" rel="noreferrer" className="underline">
                  ion.cesium.com/tokens
                </a>
                . {t("map.token.instructions")}
                <div className="mt-2 flex gap-2">
                  <Input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder={t("map.token.placeholder")} />
                  <Button onClick={saveToken}>{t("map.token.save")}</Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div
          className="absolute inset-x-0 bottom-0 z-10 flex max-h-[55%] flex-col rounded-t-lg border border-border bg-card shadow-lg transition-transform duration-300 ease-in-out"
          style={{ transform: drawerOpen ? "translateY(0)" : "translateY(calc(100% - 2.75rem))" }}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen((open) => !open)}
            aria-expanded={drawerOpen}
            className="flex h-11 shrink-0 items-center justify-between gap-2 rounded-t-lg px-3 py-2.5 text-xs font-bold tracking-wide uppercase transition-colors hover:bg-accent"
          >
            <span>{t("ardupilotSetup.fence.pointsCount", { count: items.length })}</span>
            <ChevronUp className={cn("h-4 w-4 shrink-0 transition-transform duration-300", drawerOpen ? "rotate-0" : "rotate-180")} />
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
            {items.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">{t("ardupilotSetup.fence.empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{t("ardupilotSetup.missionPlan.command")}</TableHead>
                    <TableHead>{t("ardupilotSetup.missionPlan.lat")}</TableHead>
                    <TableHead>{t("ardupilotSetup.missionPlan.lon")}</TableHead>
                    <TableHead>{t("ardupilotSetup.missionPlan.param1")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const config = commandConfig(item.command, FENCE_COMMANDS);
                    return (
                      <TableRow key={item.seq}>
                        <TableCell className="font-mono">{item.seq}</TableCell>
                        <TableCell>
                          <select
                            className="w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-xs"
                            value={item.command}
                            onChange={(e) => updateItem(item.seq, { command: Number(e.target.value) })}
                          >
                            {!FENCE_COMMANDS.some((c) => c.command === item.command) && (
                              <option value={item.command}>{t("ardupilotSetup.missionPlan.unknownCommand", { command: item.command })}</option>
                            )}
                            {FENCE_COMMANDS.map((c) => (
                              <option key={c.command} value={c.command}>
                                {t(`ardupilotSetup.fence.${c.labelKey}`)}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-7 w-24 font-mono text-xs"
                            type="number"
                            value={item.lat}
                            onChange={(e) => updateItem(item.seq, { lat: Number(e.target.value) })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-7 w-24 font-mono text-xs"
                            type="number"
                            value={item.lon}
                            onChange={(e) => updateItem(item.seq, { lon: Number(e.target.value) })}
                          />
                        </TableCell>
                        <TableCell>
                          {config.paramLabelKeys[0] ? (
                            <Input
                              className="h-7 w-20 font-mono text-xs"
                              type="number"
                              title={t(`ardupilotSetup.fence.${config.paramLabelKeys[0]}`)}
                              value={item.param1}
                              onChange={(e) => updateItem(item.seq, { param1: Number(e.target.value) })}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button type="button" size="sm" variant="ghost" onClick={() => deleteItem(item.seq)}>
                            {t("ardupilotSetup.missionPlan.deleteItem")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>

      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.missionPlan.confirmClearAllTitle")}</DialogTitle>
            <DialogDescription>{t("ardupilotSetup.missionPlan.confirmClearAllDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmClearOpen(false)}>
              {t("ardupilotSetup.missionPlan.cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={handleClearAll}>
              {t("ardupilotSetup.missionPlan.confirmClearAll")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
