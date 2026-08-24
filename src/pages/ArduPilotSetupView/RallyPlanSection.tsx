import { ChevronUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CESIUM_TOKEN_STORAGE_KEY } from "../../constants";
import { MavCmd, MavFrame } from "../../mavlink/registry/registry";
import type { MissionItemEntry, MissionTransferPhase } from "../../stores/mavlinkMissionStore/types";
import type { PositionTelemetry } from "../../stores/mavlinkTelemetryStore/types";
import { RALLY_COMMANDS } from "./missionCommandLabels";
import { useMissionMapViewer } from "./useMissionMapViewer";

const DEFAULT_ALT_M = 50;
const MARKER_COLOR = "#3b82f6";
const PATH_COLOR = "#3b82f6";

interface RallyPlanSectionProps {
  items: MissionItemEntry[];
  downloadPhase: MissionTransferPhase;
  downloadCountExpected: number | null;
  downloadError: string | null;
  uploadPhase: MissionTransferPhase;
  uploadError: string | null;
  vehiclePosition: PositionTelemetry | null;
  onDownload: () => void;
  onUpload: () => void;
  onSetItems: (items: MissionItemEntry[]) => void;
}

/** Rally point editor - the same map-click-to-add-point / table-editor pattern as
 *  MissionPlanSection/FencePlanSection (see useMissionMapViewer.ts), but rally points are
 *  independent alternate-RTL locations, not a route, so unlike Mission there's no connecting
 *  path line drawn between them. File save/load is deliberately left for a later pass (same
 *  reasoning as FencePlanSection - see its comment); live download/upload to the vehicle is the
 *  actual gap being closed here. */
export function RallyPlanSection({
  items,
  downloadPhase,
  downloadCountExpected,
  downloadError,
  uploadPhase,
  uploadError,
  vehiclePosition,
  onDownload,
  onUpload,
  onSetItems,
}: RallyPlanSectionProps) {
  const { t } = useTranslation();
  const [token, setToken] = useState(() => localStorage.getItem(CESIUM_TOKEN_STORAGE_KEY) ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(true);

  function saveToken() {
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    localStorage.setItem(CESIUM_TOKEN_STORAGE_KEY, trimmed);
    setToken(trimmed);
  }

  function addPoint(lat: number, lon: number, alt: number) {
    const seq = items.length;
    onSetItems([
      ...items,
      { seq, command: MavCmd.NAV_RALLY_POINT, frame: MavFrame.GLOBAL_RELATIVE_ALT, autocontinue: true, param1: 0, param2: 0, param3: 0, param4: 0, lat, lon, alt },
    ]);
  }

  const { containerRef } = useMissionMapViewer({
    token,
    items,
    markerColor: MARKER_COLOR,
    pathColor: PATH_COLOR,
    pathStyle: "none",
    onMapClick: (lat, lon) => {
      const lastAlt = items.length > 0 ? items[items.length - 1]!.alt : DEFAULT_ALT_M;
      addPoint(lat, lon, lastAlt);
    },
  });

  function updateItem(seq: number, patch: Partial<MissionItemEntry>) {
    onSetItems(items.map((i) => (i.seq === seq ? { ...i, ...patch } : i)));
  }

  function deleteItem(seq: number) {
    onSetItems(items.filter((i) => i.seq !== seq).map((i, index) => ({ ...i, seq: index })));
  }

  function handleAddPoint() {
    const last = items[items.length - 1];
    const lat = last?.lat ?? vehiclePosition?.lat ?? 0;
    const lon = last?.lon ?? vehiclePosition?.lon ?? 0;
    const alt = last?.alt ?? DEFAULT_ALT_M;
    addPoint(lat, lon, alt);
  }

  function handleClearAll() {
    onSetItems([]);
  }

  const downloading = downloadPhase === "active";
  const uploading = uploadPhase === "active";

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.rally.heading")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onDownload} disabled={downloading || uploading}>
            {t("ardupilotSetup.missionPlan.download")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onUpload} disabled={items.length === 0 || downloading || uploading}>
            {t("ardupilotSetup.missionPlan.upload")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={handleAddPoint}>
            {t("ardupilotSetup.rally.addPoint")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={handleClearAll} disabled={items.length === 0}>
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
          <div ref={containerRef} data-testid="rally-map" className="absolute inset-0" />
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
            <span>{t("ardupilotSetup.rally.pointsCount", { count: items.length })}</span>
            <ChevronUp className={cn("h-4 w-4 shrink-0 transition-transform duration-300", drawerOpen ? "rotate-0" : "rotate-180")} />
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
            {items.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">{t("ardupilotSetup.rally.empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{t("ardupilotSetup.missionPlan.command")}</TableHead>
                    <TableHead>{t("ardupilotSetup.missionPlan.lat")}</TableHead>
                    <TableHead>{t("ardupilotSetup.missionPlan.lon")}</TableHead>
                    <TableHead>{t("ardupilotSetup.missionPlan.alt")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                      <TableRow key={item.seq}>
                        <TableCell className="font-mono">{item.seq}</TableCell>
                        <TableCell>
                          <select
                            className="w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-xs"
                            value={item.command}
                            onChange={(e) => updateItem(item.seq, { command: Number(e.target.value) })}
                          >
                            {!RALLY_COMMANDS.some((c) => c.command === item.command) && (
                              <option value={item.command}>{t("ardupilotSetup.missionPlan.unknownCommand", { command: item.command })}</option>
                            )}
                            {RALLY_COMMANDS.map((c) => (
                              <option key={c.command} value={c.command}>
                                {t(`ardupilotSetup.rally.${c.labelKey}`)}
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
                          <Input
                            className="h-7 w-20 font-mono text-xs"
                            type="number"
                            value={item.alt}
                            onChange={(e) => updateItem(item.seq, { alt: Number(e.target.value) })}
                          />
                        </TableCell>
                        <TableCell>
                          <Button type="button" size="sm" variant="ghost" onClick={() => deleteItem(item.seq)}>
                            {t("ardupilotSetup.missionPlan.deleteItem")}
                          </Button>
                        </TableCell>
                      </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
