import {
  Cartesian2,
  Cartesian3,
  CallbackProperty,
  Cartographic,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  Entity,
  HeightReference,
  Ion,
  LabelStyle,
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CESIUM_TOKEN_STORAGE_KEY } from "../../constants";
import { flightCommandLabel, mavResultLabel } from "../../mavlink/labels/labels";
import { MavCmd, MavResult } from "../../mavlink/registry/registry";
import { useMavlinkLiveMapStore } from "../../stores/mavlinkLiveMapStore/mavlinkLiveMapStore";
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

// Shared label styling for the two altitude readouts drawn directly on the map (vehicle +
// fly-to target) - white fill with a black outline reads on both light and dark terrain
// imagery alike, matching the arrow/crosshair icons' own black-stroke-on-white convention.
// pixelOffset lifts the text clear of the icon it's attached to rather than overlapping it.
function altitudeLabelOptions(text: string, pixelOffsetY: number): Entity.ConstructorOptions["label"] {
  return {
    text,
    font: "12px sans-serif",
    fillColor: Color.WHITE,
    outlineColor: Color.BLACK,
    outlineWidth: 3,
    style: LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cartesian2(0, pixelOffsetY),
  };
}
function vehicleAltitudeLabelOptions(text: string): Entity.ConstructorOptions["label"] {
  return altitudeLabelOptions(text, -24);
}
function flyToAltitudeLabelOptions(text: string): Entity.ConstructorOptions["label"] {
  return altitudeLabelOptions(text, -20);
}

interface LiveMapSectionProps {
  position: PositionTelemetry | null;
  headingDeg: number | undefined;
  /** null hides the RTL quick-action - a vehicle family this app doesn't have a mode table for
   *  (see labels.ts's rtlModeNumber). */
  rtlModeNumber: number | null;
  /** The result of the most recently sent NAV_TAKEOFF/DO_REPOSITION/DO_SET_HOME command - see
   *  mavlinkVehicleStore's own doc comment on why RTL has no equivalent here. */
  flightCommandAck: { command: MavCmd; result: MavResult } | null;
  onFlyToHere: (lat: number, lon: number, altitudeM: number) => void;
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

export function LiveMapSection({
  position,
  headingDeg,
  rtlModeNumber,
  flightCommandAck,
  onFlyToHere,
  onSetHomeHere,
  onTakeoff,
  onRtl,
}: LiveMapSectionProps) {
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
  // The last "Fly to here" target's own altitude (relative to home, meters) - null until a
  // target has actually been sent, shown alongside the vehicle's own live altitude in the
  // action bar and as the map marker's label text.
  const [flyToTargetAlt, setFlyToTargetAlt] = useState<number | null>(null);
  const [token, setToken] = useState(() => localStorage.getItem(CESIUM_TOKEN_STORAGE_KEY) ?? "");
  const [tokenInput, setTokenInput] = useState("");
  // A single mis-click next to Recenter/RTL used to instantly drop the live map back to the
  // token-entry screen - same confirm-before-destroy treatment as this app's other
  // easy-to-fat-finger actions.
  const [confirmClearTokenOpen, setConfirmClearTokenOpen] = useState(false);
  const [takeoffAltInput, setTakeoffAltInput] = useState("10");
  const [flyToAltInput, setFlyToAltInput] = useState("0");
  // Takeoff/RTL both start real flight behavior with no undo - a misclick shouldn't be enough
  // to trigger either, so both get the same confirm-before-send dialog Arm already uses.
  const [confirmTakeoffAlt, setConfirmTakeoffAlt] = useState<number | null>(null);
  const [confirmRtlOpen, setConfirmRtlOpen] = useState(false);
  // Redefines RTL/geofence's home point for the rest of the session with no undo - same
  // confirm-before-send treatment as Takeoff/RTL above, rather than the instant commit a
  // stray right-click + one more click used to produce.
  const [confirmSetHome, setConfirmSetHome] = useState<{ lat: number; lon: number } | null>(null);
  // A right-click-triggered popup with "Fly to here"/"Set home here" - the real-GCS convention
  // this app's map now follows, rather than a left-click-arms-then-click toggle.
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // Mirrors onFlyToHere/onSetHomeHere/position for the map-click handler's closure below, which
  // is set up once per Cesium viewer lifetime (see the token-keyed effect), not per render -
  // same pattern as MissionPlanSection's itemsRef.
  const onFlyToHereRef = useRef(onFlyToHere);
  const onSetHomeHereRef = useRef(onSetHomeHere);
  const positionRef = useRef(position);
  useEffect(() => {
    onFlyToHereRef.current = onFlyToHere;
    onSetHomeHereRef.current = onSetHomeHere;
    positionRef.current = position;
  }, [onFlyToHere, onSetHomeHere, position]);

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
    setConfirmClearTokenOpen(false);
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
      // Defaults to the vehicle's own current relative altitude ("fly here at the same
      // height," matching this app's own prior default) - editable before sending, rather
      // than a fixed value the user has to always overwrite.
      setFlyToAltInput(String(Math.round(positionRef.current?.relativeAltM ?? 0)));
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

        // Restores the last "Fly to here"/"Set home here" targets from the shared store (see
        // mavlinkLiveMapStore.ts) the moment ground height - and therefore correct marker
        // altitude - is known, so switching away from this tab and back (which unmounts and
        // remounts this whole component) doesn't silently drop them, unlike before this store
        // existed. Done here rather than in the viewer-creation effect below since it needs
        // homeGroundHeightRef to already be resolved.
        const { flyToTarget, homeTarget } = useMavlinkLiveMapStore.getState();
        if (flyToTarget) placeFlyToTarget(flyToTarget.lat, flyToTarget.lon, flyToTarget.altitudeM);
        if (homeTarget) placeHomeTarget(homeTarget.lat, homeTarget.lon);
      }
      const alt = homeGroundHeightRef.current + position!.relativeAltM;
      const cartesian = Cartesian3.fromDegrees(position!.lon, position!.lat, alt);
      vehicleCartesianRef.current = cartesian;
      trailRef.current.push(cartesian);

      const rotation = headingDeg !== undefined ? -(headingDeg * (Math.PI / 180)) : 0;
      const altitudeLabel = t("ardupilotSetup.map.altitudeLabel", { meters: Math.round(position!.relativeAltM) });
      if (!markerRef.current) {
        markerRef.current = viewer!.entities.add({
          position: cartesian,
          billboard: { image: ARROW_ICON, width: 28, height: 28, alignedAxis: Cartesian3.UNIT_Z, rotation },
          label: vehicleAltitudeLabelOptions(altitudeLabel),
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
        if (markerRef.current.label) markerRef.current.label.text = new ConstantProperty(altitudeLabel);
      }

      if (!hasFlownRef.current) {
        hasFlownRef.current = true;
        const destination = Cartesian3.fromDegrees(position!.lon, position!.lat, alt + FOLLOW_HEIGHT_M);
        // The FIRST time ever this connection, animate in (matches this section's original,
        // still-useful "camera swoops to the vehicle" first-fix behavior). Every later mount
        // (switching sidebar sections away from Telemetry and back, which unmounts and
        // remounts this whole component) instead snaps the camera straight there with no
        // animation - an actual re-animated fly-to on every trip back read as the view
        // "resetting," even though the vehicle's real position hadn't gone anywhere.
        const { hasFlownOnce, setHasFlownOnce } = useMavlinkLiveMapStore.getState();
        if (hasFlownOnce) viewer!.camera.setView({ destination });
        else {
          viewer!.camera.flyTo({ destination });
          setHasFlownOnce();
        }
      }
    }

    void place();
    return () => {
      cancelled = true;
    };
    // placeFlyToTarget/placeHomeTarget intentionally excluded: they're plain function
    // declarations (a fresh reference every render), and only ever called here once, the
    // first time homeGroundHeightRef.current resolves (guarded above, not by this array) -
    // adding them would re-run this whole effect (including the terrain sample + camera
    // logic) on every unrelated re-render instead of only when the vehicle's actual position/
    // heading changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setConfirmTakeoffAlt(alt);
  }

  function confirmTakeoff() {
    if (confirmTakeoffAlt === null) return;
    onTakeoff(confirmTakeoffAlt);
    setConfirmTakeoffAlt(null);
  }

  function confirmRtl() {
    setConfirmRtlOpen(false);
    onRtl();
  }

  // Marks the last "Fly to here" target with a crosshair icon (labeled with its own altitude)
  // and a live track line back to the vehicle's current position - at the altitude the user
  // entered in the context menu (matching what handleFlyToHere (ArduPilotSetupView.tsx)
  // actually commands via DO_REPOSITION's own relative-altitude field), not the ground.
  function placeFlyToTarget(lat: number, lon: number, altitudeM: number) {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const alt = (homeGroundHeightRef.current ?? 0) + altitudeM;
    const cartesian = Cartesian3.fromDegrees(lon, lat, alt);
    flyToTargetRef.current = cartesian;
    const altitudeLabel = t("ardupilotSetup.map.altitudeLabel", { meters: Math.round(altitudeM) });
    if (!flyToMarkerRef.current) {
      flyToMarkerRef.current = viewer.entities.add({
        position: cartesian,
        billboard: { image: FLY_TO_ICON, width: 24, height: 24 },
        label: flyToAltitudeLabelOptions(altitudeLabel),
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
      if (flyToMarkerRef.current.label) flyToMarkerRef.current.label.text = new ConstantProperty(altitudeLabel);
    }
    setFlyToTargetAlt(altitudeM);
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
    const alt = Number(flyToAltInput);
    if (!Number.isFinite(alt)) return;
    onFlyToHereRef.current(contextMenu.lat, contextMenu.lon, alt);
    placeFlyToTarget(contextMenu.lat, contextMenu.lon, alt);
    // Persisted outside this component (see mavlinkLiveMapStore.ts) so switching to a
    // different sidebar section and back - which unmounts and remounts this whole component -
    // restores this marker instead of silently dropping it.
    useMavlinkLiveMapStore.getState().setFlyToTarget({ lat: contextMenu.lat, lon: contextMenu.lon, altitudeM: alt });
    setContextMenu(null);
  }

  function handleSetHomeOption() {
    if (!contextMenu) return;
    setConfirmSetHome({ lat: contextMenu.lat, lon: contextMenu.lon });
    setContextMenu(null);
  }

  function confirmSetHomeAction() {
    if (!confirmSetHome) return;
    const { lat, lon } = confirmSetHome;
    onSetHomeHereRef.current(lat, lon);
    placeHomeTarget(lat, lon);
    useMavlinkLiveMapStore.getState().setHomeTarget({ lat, lon });
    setConfirmSetHome(null);
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
        {/* One row, space distributed between the flight-action controls (left) and the
            map/token controls (right) - previously two separately-aligned rows (one
            justify-end, one default-start) left a lopsided gap under whichever side was
            shorter instead of the two sides sharing one line. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
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
              <Button type="button" size="sm" variant="destructive" onClick={() => setConfirmRtlOpen(true)}>
                {t("ardupilotSetup.map.rtl")}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">{t("ardupilotSetup.map.rightClickHint")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={recenter} disabled={!position}>
              {t("ardupilotSetup.map.recenter")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmClearTokenOpen(true)}>
              {t("map.token.clear")}
            </Button>
          </div>
        </div>
        {flightCommandAck && flightCommandAck.result !== MavResult.ACCEPTED && (
          <span role="alert" className="text-xs font-semibold text-destructive">
            {t("ardupilotSetup.map.flightCommandRejected", {
              command: flightCommandLabel(t, flightCommandAck.command),
              result: mavResultLabel(t, flightCommandAck.result),
            })}
          </span>
        )}
        {/* Plain-text mirror of the altitude labels drawn on the map itself (vehicle marker /
            fly-to crosshair) - readable without needing to spot/zoom into the 3D labels, and
            works before the scene has even rendered anything. */}
        {(position || flyToTargetAlt !== null) && (
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-muted-foreground">
            {position && <span>{t("ardupilotSetup.map.vehicleAltitude", { meters: Math.round(position.relativeAltM) })}</span>}
            {flyToTargetAlt !== null && (
              <span>{t("ardupilotSetup.map.targetAltitude", { meters: Math.round(flyToTargetAlt) })}</span>
            )}
          </div>
        )}
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
          <div className="flex items-center gap-1 px-3 py-1.5">
            <Input
              type="number"
              value={flyToAltInput}
              onChange={(e) => setFlyToAltInput(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="h-6 w-20 font-mono text-xs"
              aria-label={t("ardupilotSetup.map.flyToAltitude")}
            />
            <button
              type="button"
              className="px-2 py-1 text-left text-xs whitespace-nowrap hover:bg-accent"
              onClick={handleFlyToOption}
            >
              {t("ardupilotSetup.map.flyToHere")}
            </button>
          </div>
          <button
            type="button"
            className="px-3 py-1.5 text-left text-xs whitespace-nowrap hover:bg-accent"
            onClick={handleSetHomeOption}
          >
            {t("ardupilotSetup.map.setHomeHere")}
          </button>
        </div>
      )}

      <Dialog open={confirmTakeoffAlt !== null} onOpenChange={(open) => !open && setConfirmTakeoffAlt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.map.confirmTakeoffTitle")}</DialogTitle>
            <DialogDescription>
              {t("ardupilotSetup.map.confirmTakeoffDescription", { meters: confirmTakeoffAlt ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmTakeoffAlt(null)}>
              {t("ardupilotSetup.map.cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={confirmTakeoff}>
              {t("ardupilotSetup.map.confirmTakeoff")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmRtlOpen} onOpenChange={setConfirmRtlOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.map.confirmRtlTitle")}</DialogTitle>
            <DialogDescription>{t("ardupilotSetup.map.confirmRtlDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmRtlOpen(false)}>
              {t("ardupilotSetup.map.cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={confirmRtl}>
              {t("ardupilotSetup.map.confirmRtl")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmSetHome !== null} onOpenChange={(open) => !open && setConfirmSetHome(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.map.confirmSetHomeTitle")}</DialogTitle>
            <DialogDescription>{t("ardupilotSetup.map.confirmSetHomeDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmSetHome(null)}>
              {t("ardupilotSetup.map.cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={confirmSetHomeAction}>
              {t("ardupilotSetup.map.confirmSetHome")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmClearTokenOpen} onOpenChange={setConfirmClearTokenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("map.token.confirmClearTitle")}</DialogTitle>
            <DialogDescription>{t("map.token.confirmClearDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmClearTokenOpen(false)}>
              {t("map.token.cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={clearToken}>
              {t("map.token.confirmClear")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
