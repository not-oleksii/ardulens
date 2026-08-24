import {
  Cartesian3,
  CallbackProperty,
  Cartographic,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  Ion,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Terrain,
  Viewer,
  sampleTerrainMostDetailed,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CESIUM_TOKEN_STORAGE_KEY } from "../../constants";
import type { PositionTelemetry } from "../../stores/mavlinkTelemetryStore/types";
import { TokenlessPositionRadar } from "./TokenlessPositionRadar";

type MapClickAction = "flyTo" | "setHome" | null;

// Identical arrow icon to CesiumMapView's ARROW_ICON - rotation=0 points north, paired with
// alignedAxis: UNIT_Z below.
const ARROW_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    '<path d="M16 2 L28 27 L16 21 L4 27 Z" fill="white" stroke="black" stroke-width="2" stroke-linejoin="round"/>' +
    "</svg>",
);
const ARROW_ICON = `data:image/svg+xml,${ARROW_SVG}`;
const TRAIL_COLOR = Color.fromCssColorString("#3b82f6");
// Camera height above the vehicle on first fix / Recenter, in meters.
const FOLLOW_HEIGHT_M = 300;

interface LiveMapSectionProps {
  position: PositionTelemetry | null;
  headingDeg: number | undefined;
  /** null hides the RTL quick-action - a vehicle family this app doesn't have a mode table for
   *  (see labels.ts's rtlModeNumber). */
  rtlModeNumber: number | null;
  onFlyToHere: (lat: number, lon: number) => void;
  onSetHomeHere: (lat: number, lon: number) => void;
  onTakeoff: (altitudeM: number) => void;
  onRtl: () => void;
}

export function LiveMapSection({ position, headingDeg, rtlModeNumber, onFlyToHere, onSetHomeHere, onTakeoff, onRtl }: LiveMapSectionProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const markerRef = useRef<ReturnType<Viewer["entities"]["add"]> | null>(null);
  const trailRef = useRef<Cartesian3[]>([]);
  // ArduPilot's relative altitude is relative to home ground, not the WGS84 ellipsoid - sampled
  // once from the real terrain at the first fix (same technique as CesiumMapView's absHeight,
  // just live instead of computed once over a whole track) so the marker sits on the ground
  // rather than floating or sinking relative to Cesium World Terrain.
  const homeGroundHeightRef = useRef<number | null>(null);
  const hasFlownRef = useRef(false);
  const [token, setToken] = useState(() => localStorage.getItem(CESIUM_TOKEN_STORAGE_KEY) ?? "");
  const [tokenInput, setTokenInput] = useState("");
  // Which guided command the NEXT map click sends, if any - a one-shot "arm" toggled by the
  // Fly-to-here/Set-home buttons below, rather than every click doing something (real GCS's use
  // a right-click context menu for this; a single-click-arm toggle is this app's equivalent for
  // a touch/left-click-only map).
  const [clickAction, setClickAction] = useState<MapClickAction>(null);
  const clickActionRef = useRef(clickAction);
  const [takeoffAltInput, setTakeoffAltInput] = useState("10");
  // Mirrors clickAction/onFlyToHere/onSetHomeHere for the map-click handler's closure below,
  // which is set up once per Cesium viewer lifetime (see the token-keyed effect), not per
  // render - same pattern as MissionPlanSection's itemsRef.
  const onFlyToHereRef = useRef(onFlyToHere);
  const onSetHomeHereRef = useRef(onSetHomeHere);
  useEffect(() => {
    clickActionRef.current = clickAction;
    onFlyToHereRef.current = onFlyToHere;
    onSetHomeHereRef.current = onSetHomeHere;
  }, [clickAction, onFlyToHere, onSetHomeHere]);

  useEffect(() => {
    if (token) Ion.defaultAccessToken = token;
  }, [token]);

  function saveToken() {
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    localStorage.setItem(CESIUM_TOKEN_STORAGE_KEY, trimmed);
    setToken(trimmed);
  }

  function clearToken() {
    localStorage.removeItem(CESIUM_TOKEN_STORAGE_KEY);
    setToken("");
    setTokenInput("");
  }

  // A lightweight viewer - no timeline/animation/base-layer-picker chrome, unlike
  // CesiumMapView's post-flight playback viewer. This shows one live fact ("where is it right
  // now"), not a recording to scrub through.
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
      const action = clickActionRef.current;
      if (!action) return;
      const cartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
      if (!cartesian) return;
      const carto = Cartographic.fromCartesian(cartesian);
      const lat = CesiumMath.toDegrees(carto.latitude);
      const lon = CesiumMath.toDegrees(carto.longitude);
      if (action === "flyTo") onFlyToHereRef.current(lat, lon);
      else onSetHomeHereRef.current(lat, lon);
      setClickAction(null); // one-shot - back to a plain map click doing nothing
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
      markerRef.current = null;
      trailRef.current = [];
      homeGroundHeightRef.current = null;
      hasFlownRef.current = false;
    };
  }, [token]);

  function recenter() {
    const viewer = viewerRef.current;
    if (!viewer || !position) return;
    const groundHeight = homeGroundHeightRef.current ?? 0;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(position.lon, position.lat, groundHeight + position.relativeAltM + FOLLOW_HEIGHT_M),
    });
  }

  // Repositions the marker and extends the breadcrumb trail on every live position update - no
  // SampledPositionProperty/clock animation, this is just "where is it right now," not a
  // recording.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !position) return;
    let cancelled = false;

    async function place() {
      if (homeGroundHeightRef.current === null) {
        const [sample] = await sampleTerrainMostDetailed(viewer!.terrainProvider, [Cartographic.fromDegrees(position!.lon, position!.lat)]);
        if (cancelled) return;
        homeGroundHeightRef.current = sample?.height ?? 0;
      }
      const alt = homeGroundHeightRef.current + position!.relativeAltM;
      const cartesian = Cartesian3.fromDegrees(position!.lon, position!.lat, alt);
      trailRef.current.push(cartesian);

      const rotation = headingDeg !== undefined ? -(headingDeg * (Math.PI / 180)) : 0;
      if (!markerRef.current) {
        markerRef.current = viewer!.entities.add({
          position: cartesian,
          billboard: { image: ARROW_ICON, width: 28, height: 28, alignedAxis: Cartesian3.UNIT_Z, rotation },
          description: t("map.currentPositionDescription"),
        });
        viewer!.entities.add({
          polyline: {
            positions: new CallbackProperty(() => trailRef.current, false),
            width: 3,
            material: TRAIL_COLOR,
          },
        });
      } else {
        markerRef.current.position = new ConstantPositionProperty(cartesian);
        if (markerRef.current.billboard) markerRef.current.billboard.rotation = new ConstantProperty(rotation);
      }

      if (!hasFlownRef.current) {
        hasFlownRef.current = true;
        viewer!.camera.flyTo({ destination: Cartesian3.fromDegrees(position!.lon, position!.lat, alt + FOLLOW_HEIGHT_M) });
      }
    }

    void place();
    return () => {
      cancelled = true;
    };
  }, [position, headingDeg, t]);

  if (!token) {
    return (
      <div className="flex h-full flex-col gap-4">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.map.heading")}</h3>
        <Alert variant="info">
          <AlertDescription>
            {t("map.token.intro")}{" "}
            <a href="https://ion.cesium.com/tokens" target="_blank" rel="noreferrer" className="underline">
              ion.cesium.com/tokens
            </a>
            . {t("map.token.instructions")}
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder={t("map.token.placeholder")} />
          <Button onClick={saveToken}>{t("map.token.save")}</Button>
        </div>
        {/* No token yet doesn't have to mean no live position at all - a plain, dependency-free
            range-ring plot (see TokenlessPositionRadar's own comment) covers "where is it right
            now, roughly how far" until/unless a token is added for the full 3D terrain map. */}
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-border p-3">
          <TokenlessPositionRadar position={position} headingDeg={headingDeg} />
        </div>
      </div>
    );
  }

  function handleTakeoffClick() {
    const alt = Number(takeoffAltInput);
    if (!Number.isFinite(alt) || alt <= 0) return;
    onTakeoff(alt);
  }

  return (
    // The header/actions bar and "no fix" note float on top of the map instead of sitting above
    // it in normal flow, so the map itself fills this whole panel and its top edge lines up with
    // the PFD's in the sibling column, rather than starting lower because of the header's own
    // height. Everything floating is one flex-col block (not several independently-positioned
    // absolute elements at fixed offsets) so it grows naturally as the action row wraps, instead
    // of a fixed-offset sibling overlapping it on narrower panels.
    <div className="relative h-full">
      <div ref={containerRef} data-testid="live-map" className="absolute inset-0 rounded-lg border border-border" />
      <div className="absolute inset-x-0 top-0 z-10 flex flex-col gap-1.5 rounded-t-lg bg-card/90 px-3 py-2 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.map.heading")}</h3>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={recenter} disabled={!position}>
              {t("ardupilotSetup.map.recenter")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={clearToken}>
              {t("map.token.clear")}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={clickAction === "flyTo" ? "default" : "outline"}
            onClick={() => setClickAction((a) => (a === "flyTo" ? null : "flyTo"))}
          >
            {t("ardupilotSetup.map.flyToHere")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={clickAction === "setHome" ? "default" : "outline"}
            onClick={() => setClickAction((a) => (a === "setHome" ? null : "setHome"))}
          >
            {t("ardupilotSetup.map.setHomeHere")}
          </Button>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={takeoffAltInput}
              onChange={(e) => setTakeoffAltInput(e.target.value)}
              className="h-7 w-16 font-mono text-xs"
              aria-label={t("ardupilotSetup.map.takeoffAltitude")}
            />
            <Button type="button" size="sm" variant="outline" onClick={handleTakeoffClick}>
              {t("ardupilotSetup.map.takeoff")}
            </Button>
          </div>
          {rtlModeNumber !== null && (
            <Button type="button" size="sm" variant="destructive" onClick={onRtl}>
              {t("ardupilotSetup.map.rtl")}
            </Button>
          )}
        </div>
        {clickAction && <p className="text-xs text-muted-foreground">{t("ardupilotSetup.map.clickToConfirm")}</p>}
        {!position && <p className="text-xs text-muted-foreground">{t("ardupilotSetup.map.noFix")}</p>}
      </div>
    </div>
  );
}
