import { Cartesian3, CallbackProperty, Cartographic, Color, ConstantPositionProperty, ConstantProperty, Ion, Terrain, Viewer, sampleTerrainMostDetailed } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CESIUM_TOKEN_STORAGE_KEY } from "../../constants";
import type { PositionTelemetry } from "../../stores/mavlinkTelemetryStore/types";
import { TokenlessPositionRadar } from "./TokenlessPositionRadar";

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
}

export function LiveMapSection({ position, headingDeg }: LiveMapSectionProps) {
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
    return () => {
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

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.map.heading")}</h3>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={recenter} disabled={!position}>
            {t("ardupilotSetup.map.recenter")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={clearToken}>
            {t("map.token.clear")}
          </Button>
        </div>
      </div>
      {!position && <p className="text-xs text-muted-foreground">{t("ardupilotSetup.map.noFix")}</p>}
      <div ref={containerRef} data-testid="live-map" className="min-h-0 flex-1 rounded-lg border border-border" />
    </div>
  );
}
