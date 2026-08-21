import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  HeightReference,
  Ion,
  LabelStyle,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Terrain,
  Viewer,
  VerticalOrigin,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CESIUM_TOKEN_STORAGE_KEY } from "../../constants";
import { MavCmd, MavFrame } from "../../mavlink/registry/registry";
import { formatWaypointsFile, parseWaypointsFile } from "../../mavlink/missionFileCodec/missionFileCodec";
import type { MissionItemEntry, MissionTransferPhase } from "../../stores/mavlinkMissionStore/types";
import type { PositionTelemetry } from "../../stores/mavlinkTelemetryStore/types";
import { missionCommandConfig, MISSION_COMMANDS } from "./missionCommandLabels";

const DEFAULT_ALT_M = 50;
const PATH_COLOR = Color.fromCssColorString("#f59e0b");
const MARKER_COLOR = Color.fromCssColorString("#f59e0b");

interface MissionPlanSectionProps {
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

export function MissionPlanSection({
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
}: MissionPlanSectionProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState(() => localStorage.getItem(CESIUM_TOKEN_STORAGE_KEY) ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  // Mirrors `items`/`onSetItems` for the map-click handler's closure below, which is set up once
  // per Cesium viewer lifetime (see the token-keyed effect), not per render.
  const itemsRef = useRef(items);
  const onSetItemsRef = useRef(onSetItems);
  useEffect(() => {
    itemsRef.current = items;
    onSetItemsRef.current = onSetItems;
  }, [items, onSetItems]);

  useEffect(() => {
    if (token) Ion.defaultAccessToken = token;
  }, [token]);

  function saveToken() {
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    localStorage.setItem(CESIUM_TOKEN_STORAGE_KEY, trimmed);
    setToken(trimmed);
  }

  function addItem(lat: number, lon: number, alt: number) {
    const current = itemsRef.current;
    const seq = current.length;
    onSetItemsRef.current([
      ...current,
      { seq, command: MavCmd.NAV_WAYPOINT, frame: MavFrame.GLOBAL_RELATIVE_ALT, autocontinue: true, param1: 0, param2: 0, param3: 0, param4: 0, lat, lon, alt },
    ]);
  }

  // A lightweight viewer (no timeline/animation chrome, matching LiveMapSection) plus a
  // left-click handler that drops a new NAV_WAYPOINT at the clicked ground location - the
  // click-to-add-waypoint interaction Mission Planner's own Flight Plan map supports.
  useEffect(() => {
    if (!token || !containerRef.current) return;
    const viewer = new Viewer(containerRef.current, {
      terrain: Terrain.fromWorldTerrain(),
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
    });
    viewerRef.current = viewer;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: ScreenSpaceEventHandler.PositionedEvent) => {
      const cartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
      if (!cartesian) return;
      const carto = Cartographic.fromCartesian(cartesian);
      const lat = CesiumMath.toDegrees(carto.latitude);
      const lon = CesiumMath.toDegrees(carto.longitude);
      const current = itemsRef.current;
      const lastAlt = current.length > 0 ? current[current.length - 1]!.alt : DEFAULT_ALT_M;
      addItem(lat, lon, lastAlt);
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [token]);

  // Redraws every marker/path segment from scratch on every items change - missions are small
  // (tens of waypoints, not thousands), so there's no real cost to this over hand-rolled diffing.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.entities.removeAll();
    if (items.length === 0) return;
    for (const item of items) {
      viewer.entities.add({
        position: Cartesian3.fromDegrees(item.lon, item.lat, item.alt),
        point: { pixelSize: 10, color: MARKER_COLOR, heightReference: HeightReference.RELATIVE_TO_GROUND },
        label: {
          text: String(item.seq),
          font: "12px sans-serif",
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -14),
          heightReference: HeightReference.RELATIVE_TO_GROUND,
        },
      });
    }
    if (items.length > 1) {
      viewer.entities.add({
        polyline: {
          positions: items.map((item) => Cartesian3.fromDegrees(item.lon, item.lat, item.alt)),
          width: 2,
          material: PATH_COLOR,
          clampToGround: false,
        },
      });
    }
  }, [items]);

  function updateItem(seq: number, patch: Partial<MissionItemEntry>) {
    onSetItems(items.map((i) => (i.seq === seq ? { ...i, ...patch } : i)));
  }

  function deleteItem(seq: number) {
    onSetItems(
      items
        .filter((i) => i.seq !== seq)
        .map((i, index) => ({ ...i, seq: index })),
    );
  }

  function handleAddWaypoint() {
    const last = items[items.length - 1];
    const lat = last?.lat ?? vehiclePosition?.lat ?? 0;
    const lon = last?.lon ?? vehiclePosition?.lon ?? 0;
    const alt = last?.alt ?? DEFAULT_ALT_M;
    addItem(lat, lon, alt);
  }

  function handleClearAll() {
    onSetItems([]);
  }

  function handleSaveFile() {
    const blob = new Blob([formatWaypointsFile(items)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mission.waypoints";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLoadFileClick() {
    setLoadError(null);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      onSetItems(parseWaypointsFile(text));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  const downloading = downloadPhase === "active";
  const uploading = uploadPhase === "active";

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.missionPlan.heading")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onDownload} disabled={downloading || uploading}>
            {t("ardupilotSetup.missionPlan.download")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onUpload} disabled={items.length === 0 || downloading || uploading}>
            {t("ardupilotSetup.missionPlan.upload")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={handleAddWaypoint}>
            {t("ardupilotSetup.missionPlan.addWaypoint")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={handleSaveFile} disabled={items.length === 0}>
            {t("ardupilotSetup.missionPlan.saveFile")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={handleLoadFileClick}>
            {t("ardupilotSetup.missionPlan.loadFile")}
          </Button>
          <input ref={fileInputRef} type="file" accept=".waypoints,.txt" className="hidden" onChange={(e) => void handleFileSelected(e)} />
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
      {loadError && <Alert variant="destructive"><AlertDescription>{loadError}</AlertDescription></Alert>}

      {token ? (
        <div ref={containerRef} data-testid="mission-map" className="h-72 shrink-0 rounded-lg border border-border" />
      ) : (
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
      )}

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("ardupilotSetup.missionPlan.empty")}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{t("ardupilotSetup.missionPlan.command")}</TableHead>
                <TableHead>{t("ardupilotSetup.missionPlan.lat")}</TableHead>
                <TableHead>{t("ardupilotSetup.missionPlan.lon")}</TableHead>
                <TableHead>{t("ardupilotSetup.missionPlan.alt")}</TableHead>
                <TableHead>{t("ardupilotSetup.missionPlan.param1")}</TableHead>
                <TableHead>{t("ardupilotSetup.missionPlan.param2")}</TableHead>
                <TableHead>{t("ardupilotSetup.missionPlan.param3")}</TableHead>
                <TableHead>{t("ardupilotSetup.missionPlan.param4")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const config = missionCommandConfig(item.command);
                return (
                  <TableRow key={item.seq}>
                    <TableCell className="font-mono">{item.seq}</TableCell>
                    <TableCell>
                      <select
                        className="w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-xs"
                        value={item.command}
                        onChange={(e) => updateItem(item.seq, { command: Number(e.target.value) })}
                      >
                        {!MISSION_COMMANDS.some((c) => c.command === item.command) && (
                          <option value={item.command}>{t("ardupilotSetup.missionPlan.unknownCommand", { command: item.command })}</option>
                        )}
                        {MISSION_COMMANDS.map((c) => (
                          <option key={c.command} value={c.command}>
                            {t(`ardupilotSetup.missionPlan.${c.labelKey}`)}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      {config.usesPosition ? (
                        <Input
                          className="h-7 w-24 font-mono text-xs"
                          type="number"
                          value={item.lat}
                          onChange={(e) => updateItem(item.seq, { lat: Number(e.target.value) })}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {config.usesPosition ? (
                        <Input
                          className="h-7 w-24 font-mono text-xs"
                          type="number"
                          value={item.lon}
                          onChange={(e) => updateItem(item.seq, { lon: Number(e.target.value) })}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {config.usesPosition ? (
                        <Input
                          className="h-7 w-20 font-mono text-xs"
                          type="number"
                          value={item.alt}
                          onChange={(e) => updateItem(item.seq, { alt: Number(e.target.value) })}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    {(["param1", "param2", "param3", "param4"] as const).map((paramField, index) => {
                      const paramLabelKey = config.paramLabelKeys[index];
                      return (
                        <TableCell key={paramField}>
                          {paramLabelKey ? (
                            <Input
                              className="h-7 w-20 font-mono text-xs"
                              type="number"
                              title={t(`ardupilotSetup.missionPlan.${paramLabelKey}`)}
                              value={item[paramField]}
                              onChange={(e) => updateItem(item.seq, { [paramField]: Number(e.target.value) })}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      );
                    })}
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
        </div>
      )}
    </div>
  );
}
