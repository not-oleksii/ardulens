import {
  Cartesian3,
  CallbackProperty,
  Cartographic,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  Entity,
  HeightReference,
  Ion,
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
import { pickLatLon } from "./cesiumPicking";
import { TokenlessPositionRadar } from "./TokenlessPositionRadar";

// Identical arrow icon to CesiumMapView's ARROW_ICON - rotation=0 points north, paired with
// alignedAxis: UNIT_Z below.
const ARROW_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    '<path d="M16 2 L28 27 L16 21 L4 27 Z" fill="white" stroke="black" stroke-width="2" stroke-linejoin="round"/>' +
    "</svg>",
);
const ARROW_ICON = `data:image/svg+xml,${ARROW_SVG}`;
// A target/crosshair icon for the last "Fly to here" command, and its track line - amber,
// matching MissionPlanSection's own waypoint/path color for visual consistency between this
// app's two "commanded destination" markers.
const FLY_TO_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">' +
    '<circle cx="13" cy="13" r="9" fill="none" stroke="#f59e0b" stroke-width="3"/>' +
    '<circle cx="13" cy="13" r="3" fill="#f59e0b"/>' +
    "</svg>",
);
const FLY_TO_ICON = `data:image/svg+xml,${FLY_TO_SVG}`;
const FLY_TO_LINE_COLOR = Color.fromCssColorString("#f59e0b");
// A house icon for the last "Set home here" command - green, a common real-GCS convention for
// the home/RTL-return point.
const HOME_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">' +
    '<path d="M13 3 L23 12 H19 V23 H7 V12 H3 Z" fill="#22c55e" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>' +
    "</svg>",
);
const HOME_ICON = `data:image/svg+xml,${HOME_SVG}`;
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

interface ContextMenuState {
  /** Screen-space pixel coords (relative to the map container) - where the menu is drawn. */
  x: number;
  y: number;
  /** The right-clicked point's real lat/lon - where a chosen command is sent. */
  lat: number;
  lon: number;
}

export function LiveMapSection({ position, headingDeg, rtlModeNumber, onFlyToHere, onSetHomeHere, onTakeoff, onRtl }: LiveMapSectionProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const markerRef = useRef<ReturnType<Viewer["entities"]["add"]> | null>(null);
  const trailRef = useRef<Cartesian3[]>([]);
  // The vehicle's own current position, mirrored outside React state so the Fly-to-here track
  // line's CallbackProperty (below) can read a live value without re-subscribing per tick.
  const vehicleCartesianRef = useRef<Cartesian3 | null>(null);
  // The last "Fly to here"/"Set home here" target, and the entities showing them - null until
  // the corresponding command has actually been sent at least once.
  const flyToTargetRef = useRef<Cartesian3 | null>(null);
  const flyToMarkerRef = useRef<Entity | null>(null);
  const flyToLineRef = useRef<Entity | null>(null);
  const homeMarkerRef = useRef<Entity | null>(null);
  // ArduPilot's relative altitude is relative to home ground, not the WGS84 ellipsoid - sampled
  // once from the real terrain at the first fix (same technique as CesiumMapView's absHeight,
  // just live instead of computed once over a whole track) so the marker sits on the ground
  // rather than floating or sinking relative to Cesium World Terrain.
  const homeGroundHeightRef = useRef<number | null>(null);
  const hasFlownRef = useRef(false);
  const [token, setToken] = useState(() => localStorage.getItem(CESIUM_TOKEN_STORAGE_KEY) ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [takeoffAltInput, setTakeoffAltInput] = useState("10");
  // A right-click-triggered popup with "Fly to here"/"Set home here" - the real-GCS convention
  // this app's map now follows, rather than a left-click-arms-then-click toggle.
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // Mirrors onFlyToHere/onSetHomeHere for the map-click handler's closure below, which is set up
  // once per Cesium viewer lifetime (see the token-keyed effect), not per render - same pattern
  // as MissionPlanSection's itemsRef.
  const onFlyToHereRef = useRef(onFlyToHere);
  const onSetHomeHereRef = useRef(onSetHomeHere);
  useEffect(() => {
    onFlyToHereRef.current = onFlyToHere;
    onSetHomeHereRef.current = onSetHomeHere;
  }, [onFlyToHere, onSetHomeHere]);

  // Closes the context menu on Escape or a click anywhere else - a real click (left button),
  // since a right-click that opens a NEW menu doesn't fire the DOM's own "click" event at all.
  useEffect(() => {
    if (!contextMenu) return;
    function close() {
      setContextMenu(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setContextMenu(null);
    }
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

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

    // Right-click opens the "Fly to here"/"Set home here" popup at the clicked point - the same
    // interaction real GCS's use, rather than competing with Cesium's own left-click-drag camera
    // rotation. A plain right-click (no drag) is a distinct ScreenSpaceEventType from Cesium's
    // right-drag-to-zoom camera gesture, so this doesn't fight the default camera controls.
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = pickLatLon(viewer, movement.position);
      if (!picked) return;
      setContextMenu({ x: movement.position.x, y: movement.position.y, lat: picked.lat, lon: picked.lon });
    }, ScreenSpaceEventType.RIGHT_CLICK);

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
      markerRef.current = null;
      trailRef.current = [];
      vehicleCartesianRef.current = null;
      flyToTargetRef.current = null;
      flyToMarkerRef.current = null;
      flyToLineRef.current = null;
      homeMarkerRef.current = null;
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
      vehicleCartesianRef.current = cartesian;
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

  // Marks the last "Fly to here" target with a crosshair icon and a live track line back to the
  // vehicle's current position - at the vehicle's own current altitude, matching what
  // handleFlyToHere (ArduPilotSetupView.tsx) actually commands (DO_REPOSITION keeps the current
  // relative altitude), not the ground.
  function placeFlyToTarget(lat: number, lon: number) {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const alt = (homeGroundHeightRef.current ?? 0) + (position?.relativeAltM ?? 0);
    const cartesian = Cartesian3.fromDegrees(lon, lat, alt);
    flyToTargetRef.current = cartesian;
    if (!flyToMarkerRef.current) {
      flyToMarkerRef.current = viewer.entities.add({
        position: cartesian,
        billboard: { image: FLY_TO_ICON, width: 24, height: 24 },
      });
      flyToLineRef.current = viewer.entities.add({
        polyline: {
          positions: new CallbackProperty(() => {
            const target = flyToTargetRef.current;
            const vehicle = vehicleCartesianRef.current;
            return target && vehicle ? [vehicle, target] : [];
          }, false),
          width: 2,
          material: FLY_TO_LINE_COLOR,
        },
      });
    } else {
      flyToMarkerRef.current.position = new ConstantPositionProperty(cartesian);
    }
  }

  // Marks the last "Set home here" point with a house icon, clamped to the real terrain height
  // (a home point is a ground reference, not an airborne target like the fly-to one above).
  function placeHomeTarget(lat: number, lon: number) {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const cartesian = Cartesian3.fromDegrees(lon, lat);
    if (!homeMarkerRef.current) {
      homeMarkerRef.current = viewer.entities.add({
        position: cartesian,
        billboard: { image: HOME_ICON, width: 22, height: 22, heightReference: HeightReference.CLAMP_TO_GROUND },
      });
    } else {
      homeMarkerRef.current.position = new ConstantPositionProperty(cartesian);
    }
  }

  function handleFlyToOption() {
    if (!contextMenu) return;
    onFlyToHereRef.current(contextMenu.lat, contextMenu.lon);
    placeFlyToTarget(contextMenu.lat, contextMenu.lon);
    setContextMenu(null);
  }

  function handleSetHomeOption() {
    if (!contextMenu) return;
    onSetHomeHereRef.current(contextMenu.lat, contextMenu.lon);
    placeHomeTarget(contextMenu.lat, contextMenu.lon);
    setContextMenu(null);
  }

  return (
    // The actions bar and "no fix" note float on top of the map instead of sitting above it in
    // normal flow, so the map itself fills this whole panel and its top edge lines up with the
    // PFD's in the sibling column, rather than starting lower because of the bar's own height.
    // onContextMenu is suppressed here so a right-click opens this app's own Fly-to/Set-home
    // popup instead of the browser's native context menu.
    <div className="relative h-full" onContextMenu={(e) => e.preventDefault()}>
      <div ref={containerRef} data-testid="live-map" className="absolute inset-0 rounded-lg border border-border" />
      <div className="absolute inset-x-0 top-0 z-10 flex flex-col gap-1.5 rounded-t-lg bg-card/90 px-3 py-2 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={recenter} disabled={!position}>
            {t("ardupilotSetup.map.recenter")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={clearToken}>
            {t("map.token.clear")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <p className="text-xs text-muted-foreground">{t("ardupilotSetup.map.rightClickHint")}</p>
        </div>
        {!position && <p className="text-xs text-muted-foreground">{t("ardupilotSetup.map.noFix")}</p>}
      </div>
      {contextMenu && (
        <div
          // bg-card/text-card-foreground, not bg-popover/text-popover-foreground - this theme
          // never defines a --popover token (only Dialog's own --card one), so bg-popover here
          // silently resolved to no background at all, leaving the menu nearly invisible over
          // the map.
          className="absolute z-20 flex flex-col overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          // Stop the popup's own clicks from bubbling to the window listener that closes it -
          // that listener is what makes the two option buttons below work at all.
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="px-3 py-1.5 text-left text-xs whitespace-nowrap hover:bg-accent"
            onClick={handleFlyToOption}
          >
            {t("ardupilotSetup.map.flyToHere")}
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-left text-xs whitespace-nowrap hover:bg-accent"
            onClick={handleSetHomeOption}
          >
            {t("ardupilotSetup.map.setHomeHere")}
          </button>
        </div>
      )}
    </div>
  );
}
