import {
  CallbackProperty,
  Cartesian3,
  Cartographic,
  ClockRange,
  Color,
  type Entity,
  GeometryInstance,
  Ion,
  JulianDate,
  PolylineColorAppearance,
  PolylineGeometry,
  Primitive,
  Rectangle,
  SampledPositionProperty,
  Terrain,
  Viewer,
  sampleTerrainMostDetailed,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { isFlightMapData, isFlightMapError, isFlightMapInfo, type FlightMapResult } from "../../analysis/flight-map/types";
import type { TrackPoint } from "../../analysis/flight-map/types";
import { FlightBinBuilder } from "../../builders/FlightBinBuilder/FlightBinBuilder";
import { getCoreWorker } from "../../services/coreWorkerClient/coreWorkerClient";

const TOKEN_STORAGE_KEY = "ardulens.cesiumIonToken";
const TARGET_PLAYBACK_SECONDS = 20; // aim for the whole flight to animate in about this long

// Colors distinguishing the fused/GCS, raw GPS, and cleaned tracks - matching the legend
// swatches and the GPS-loss marker color below.
const TRACK_COLORS = {
  gcsTrack: Color.fromCssColorString("#3b82f6"), // blue - fused/GCS position
  gpsTrack: Color.fromCssColorString("#ef4444"), // red - raw GPS, includes spoofed excursions
  cleanedTrack: Color.fromCssColorString("#22c55e"), // green - raw GPS after teleport rejection
};
const GPS_LOSS_COLOR = Color.fromCssColorString("#f97316"); // orange - GPS lost
const GPS_LOSS_OUTLINE_COLOR = Color.fromCssColorString("#7c2d12");
const GPS_FOUND_COLOR = Color.fromCssColorString("#22c55e"); // green - GPS reacquired
const GPS_FOUND_OUTLINE_COLOR = Color.fromCssColorString("#14532d");

// A compass-needle-style arrow, drawn pointing "up" - paired with alignedAxis: UNIT_Z on
// the billboard below, so rotation=0 points north and the rotation angle rotates it to
// match the current heading of travel.
const ARROW_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    '<path d="M16 2 L28 27 L16 21 L4 27 Z" fill="white" stroke="black" stroke-width="2" stroke-linejoin="round"/>' +
    "</svg>",
);
const ARROW_ICON = `data:image/svg+xml,${ARROW_SVG}`;

/**
 * Per-vertex colors fading from a light, translucent tint at the start of the track to a
 * bold, fully-opaque version of the base color at the end - so the direction of travel is
 * visible directly on the path, without needing separate start/end markers.
 */
function gradientColors(base: Color, count: number): Color[] {
  const colors: Color[] = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 1;
    const lightened = Color.lerp(base, Color.WHITE, 0.6 * (1 - t), new Color());
    colors.push(lightened.withAlpha(0.5 + 0.5 * t));
  }
  return colors;
}

/** A thick, gradient-colored polyline primitive (start = light/faint, end = bold/solid). */
function buildGradientPolyline(positions: Cartesian3[], baseColor: Color, width: number, show: boolean): Primitive | null {
  if (positions.length < 2) return null;
  return new Primitive({
    geometryInstances: new GeometryInstance({
      geometry: new PolylineGeometry({
        positions,
        width,
        vertexFormat: PolylineColorAppearance.VERTEX_FORMAT,
        colors: gradientColors(baseColor, positions.length),
        colorsPerVertex: true,
      }),
    }),
    appearance: new PolylineColorAppearance({ translucent: true }),
    asynchronous: false,
    show,
  });
}

/** Great-circle initial bearing from (lat1,lon1) to (lat2,lon2), in radians, 0 = north, clockwise-positive. */
function bearingRadians(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return Math.atan2(y, x);
}

/**
 * A rectangle around a track's extent, padded and clamped to a minimum size so a flyTo
 * gives a sensible view whether the flight is a tiny loop or spans many kilometers -
 * a fixed camera height/distance can't serve both.
 */
function computeFramingRectangle(track: TrackPoint[]): Rectangle | null {
  if (!track.length) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const p of track) {
    if (p.lon < west) west = p.lon;
    if (p.lon > east) east = p.lon;
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
  }
  const MIN_SPAN_DEG = 0.01; // ~1km at typical latitudes - keeps small loops from over-zooming
  const lonSpan = Math.max(east - west, MIN_SPAN_DEG);
  const latSpan = Math.max(north - south, MIN_SPAN_DEG);
  const centerLon = (west + east) / 2;
  const centerLat = (south + north) / 2;
  const lonHalf = (lonSpan / 2) * 1.3; // 30% padding so the track isn't flush against the edges
  const latHalf = (latSpan / 2) * 1.3;
  return Rectangle.fromDegrees(centerLon - lonHalf, centerLat - latHalf, centerLon + lonHalf, centerLat + latHalf);
}

/** Per-track-point heading (radians) toward the next point, for orienting the arrow marker. */
function computeHeadings(track: TrackPoint[]): Array<{ tMs: number; heading: number }> {
  const headings: Array<{ tMs: number; heading: number }> = [];
  for (let i = 0; i < track.length; i++) {
    const a = track[i]!;
    const b = track[i + 1] ?? a;
    headings.push({ tMs: a.t, heading: bearingRadians(a.lat, a.lon, b.lat, b.lon) });
  }
  return headings;
}

interface LoadedResult {
  name: string;
  result: FlightMapResult;
}

interface MapLayers {
  gcsTrack: Primitive | null;
  gpsTrack: Primitive | null;
  cleanedTrack: Primitive | null;
  aircraft: Entity | null;
  gpsLossMarkers: Entity[];
}

const EMPTY_LAYERS: MapLayers = { gcsTrack: null, gpsTrack: null, cleanedTrack: null, aircraft: null, gpsLossMarkers: [] };

/**
 * The 3D flight-map view, built on CesiumJS terrain/imagery. Replaced the earlier 2D
 * MapLibre map outright - Cesium's 3D terrain plus the animated, timeline-synced marker
 * give a clearer picture of a flight than a flat overlay does.
 *
 * The antenna/line-of-sight feature that was prototyped early on was removed and never
 * reinstated: Cesium's default World Terrain is bare-earth only (no trees, no buildings),
 * so an LOS check against it would report "clear" in places that are actually obstructed -
 * misleading for real antenna/obstruction planning. Revisit if/when a surface model with
 * buildings/canopy is wired in.
 */
export function CesiumMapView() {
  const { t } = useTranslation();
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [loaded, setLoaded] = useState<LoadedResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showGcsTrack, setShowGcsTrack] = useState(true);
  const [showGpsTrack, setShowGpsTrack] = useState(true);
  const [showCleanedTrack, setShowCleanedTrack] = useState(true);
  const [showCurrentPosition, setShowCurrentPosition] = useState(true);
  const [showGpsLoss, setShowGpsLoss] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const showGcsTrackRef = useRef(true);
  const showGpsTrackRef = useRef(true);
  const showCleanedTrackRef = useRef(true);
  const showCurrentPositionRef = useRef(true);
  const showGpsLossRef = useRef(true);
  const layersRef = useRef<MapLayers>(EMPTY_LAYERS);

  useEffect(() => {
    if (token) Ion.defaultAccessToken = token;
  }, [token]);

  function saveToken() {
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
    setToken(trimmed);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken("");
    setTokenInput("");
  }

  async function loadBuffer(name: string, buf: ArrayBuffer) {
    setIsParsing(true);
    try {
      const worker = getCoreWorker();
      const result = await worker.buildFlightMapDataFromBin(name, buf);
      setLoaded({ name, result });
    } finally {
      setIsParsing(false);
    }
  }

  async function handleFile(file: File) {
    await loadBuffer(file.name, await file.arrayBuffer());
  }

  function loadSample() {
    // Yosemite Valley - real relief (cliffs around a flat valley floor). A short spoofing
    // window (a clear minority of the flight) demonstrates the GPS-loss markers too.
    const buf = new FlightBinBuilder()
      .withDurationSeconds(300)
      .withBase(37.745, -119.593)
      .withGpsSpoofing(120, 150)
      .build();
    void loadBuffer("sample-flight.bin", buf);
  }

  // Create the viewer once a token is available.
  useEffect(() => {
    if (!token || !containerRef.current) return;
    const viewer = new Viewer(containerRef.current, { terrain: Terrain.fromWorldTerrain() });
    viewerRef.current = viewer;
    return () => {
      viewer.destroy();
      viewerRef.current = null;
      layersRef.current = EMPTY_LAYERS;
    };
  }, [token]);

  // Fly the camera to fit the flight's actual extent on load. Framed on the trusted
  // GCS/cleaned track rather than the raw GPS track - the raw track can include a wild
  // spoofed excursion far from the real flight, and including it here would force the
  // camera to zoom out so far the actual flight shrinks to an invisible speck (mirrors
  // computeBounds() in the old 2D MapLibre map). A fixed camera height didn't work for
  // both a small ~1km test loop and a real multi-kilometer flight, so this fits whatever
  // extent is actually loaded.
  useEffect(() => {
    const viewer = viewerRef.current;
    const mapData = loaded && isFlightMapData(loaded.result) ? loaded.result : null;
    if (!viewer || !mapData) return;
    const framingTrack = mapData.gcsTrack.length
      ? mapData.gcsTrack
      : mapData.cleanedTrack.length
        ? mapData.cleanedTrack
        : mapData.gpsTrack;
    const rectangle = computeFramingRectangle(framingTrack);
    if (!rectangle) return;
    viewer.camera.flyTo({ destination: rectangle });
  }, [loaded]);

  // Rebuild every track layer + the animated "current position" marker whenever the
  // loaded data changes.
  useEffect(() => {
    const viewer = viewerRef.current;
    const mapData = loaded && isFlightMapData(loaded.result) ? loaded.result : null;
    if (!viewer || !mapData || !mapData.gcsTrack.length) return;

    let cancelled = false;
    const gcsTrack = mapData.gcsTrack;
    const home = gcsTrack[0]!;

    void (async () => {
      // Track altitude is relative-to-home (see FlightBinBuilder/POS.RelHomeAlt) - anchor
      // it to the real terrain elevation at the home point to get an approximate absolute
      // height, since Cesium's terrain/positions are absolute (above the ellipsoid).
      const [homeSample] = await sampleTerrainMostDetailed(viewer.terrainProvider, [
        Cartographic.fromDegrees(home.lon, home.lat),
      ]);
      if (cancelled) return;
      const homeGroundHeight = homeSample?.height ?? 0;
      const absHeight = (p: { alt: number | null }) => homeGroundHeight + (p.alt ?? 0);
      const toPositions = (points: TrackPoint[]) => points.map((p) => Cartesian3.fromDegrees(p.lon, p.lat, absHeight(p)));

      const prev = layersRef.current;
      if (prev.gcsTrack) viewer.scene.primitives.remove(prev.gcsTrack);
      if (prev.gpsTrack) viewer.scene.primitives.remove(prev.gpsTrack);
      if (prev.cleanedTrack) viewer.scene.primitives.remove(prev.cleanedTrack);
      if (prev.aircraft) viewer.entities.remove(prev.aircraft);
      for (const marker of prev.gpsLossMarkers) viewer.entities.remove(marker);

      const TRACK_WIDTH = 6;
      const gcsPrimitive = buildGradientPolyline(
        toPositions(gcsTrack),
        TRACK_COLORS.gcsTrack,
        TRACK_WIDTH,
        showGcsTrackRef.current,
      );
      if (gcsPrimitive) viewer.scene.primitives.add(gcsPrimitive);
      const gpsPrimitive = buildGradientPolyline(
        toPositions(mapData.gpsTrack),
        TRACK_COLORS.gpsTrack,
        TRACK_WIDTH,
        showGpsTrackRef.current,
      );
      if (gpsPrimitive) viewer.scene.primitives.add(gpsPrimitive);
      const cleanedPrimitive = buildGradientPolyline(
        toPositions(mapData.cleanedTrack),
        TRACK_COLORS.cleanedTrack,
        TRACK_WIDTH,
        showCleanedTrackRef.current,
      );
      if (cleanedPrimitive) viewer.scene.primitives.add(cleanedPrimitive);

      // Up to two markers per GPS-loss/spoofing region (see flight-map.ts's
      // groupIntoRegions()): an orange dot where GPS was lost (anchored to the trusted GCS
      // position/altitude when the loss started) and a green dot where it was reacquired
      // (anchored at the first trustworthy sample afterward - every region gets its own
      // recovery marker, not just the last one in a run of otherwise-unrelated blips). The
      // "reacquired" marker is only omitted when the track ends while still untrustworthy
      // (endLat/endLon null - nothing to anchor it to). Altitude is baked into the title
      // (shown directly in Cesium's InfoBox header) since the description body alone is
      // easy to miss/hard to read.
      const labelWithAltitude = (baseTitle: string, alt: number | null) =>
        alt !== null ? `${baseTitle} - ${t("map.gpsLoss.altitudeShort", { value: Math.round(alt) })}` : baseTitle;

      const gpsLossMarkers = mapData.gpsLossRegions.flatMap((region) => {
        const markers: Entity[] = [];
        if (region.startLat !== null && region.startLon !== null) {
          const label = labelWithAltitude(t("map.gpsLoss.lostTitle"), region.startAlt);
          markers.push(
            viewer.entities.add({
              name: label,
              position: Cartesian3.fromDegrees(region.startLon, region.startLat, absHeight({ alt: region.startAlt })),
              point: {
                pixelSize: 12,
                color: GPS_LOSS_COLOR.withAlpha(0.9),
                outlineColor: GPS_LOSS_OUTLINE_COLOR,
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
              description: `<strong>${label}</strong>`,
              show: showGpsLossRef.current,
            }),
          );
        }
        if (region.endLat !== null && region.endLon !== null) {
          const label = labelWithAltitude(t("map.gpsLoss.foundTitle"), region.endAlt);
          markers.push(
            viewer.entities.add({
              name: label,
              position: Cartesian3.fromDegrees(region.endLon, region.endLat, absHeight({ alt: region.endAlt })),
              point: {
                pixelSize: 12,
                color: GPS_FOUND_COLOR.withAlpha(0.9),
                outlineColor: GPS_FOUND_OUTLINE_COLOR,
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
              description: `<strong>${label}</strong>`,
              show: showGpsLossRef.current,
            }),
          );
        }
        return markers;
      });

      // An animated marker that flies the recorded GCS track over time, synced to
      // Cesium's own timeline/play controls at the bottom of the map.
      const startTime = JulianDate.now();
      const positionProperty = new SampledPositionProperty();
      for (const p of gcsTrack) {
        positionProperty.addSample(
          JulianDate.addSeconds(startTime, p.t / 1000, new JulianDate()),
          Cartesian3.fromDegrees(p.lon, p.lat, absHeight(p)),
        );
      }
      const durationSec = gcsTrack[gcsTrack.length - 1]!.t / 1000;
      const stopTime = JulianDate.addSeconds(startTime, durationSec, new JulianDate());
      viewer.clock.startTime = startTime.clone();
      viewer.clock.stopTime = stopTime.clone();
      viewer.clock.currentTime = startTime.clone();
      viewer.clock.clockRange = ClockRange.LOOP_STOP;
      viewer.clock.multiplier = Math.max(1, Math.round(durationSec / TARGET_PLAYBACK_SECONDS));
      viewer.clock.shouldAnimate = true;
      viewer.timeline?.zoomTo(startTime, stopTime);

      const headings = computeHeadings(gcsTrack);
      const aircraftEntity = viewer.entities.add({
        position: positionProperty,
        billboard: {
          image: ARROW_ICON,
          width: 28,
          height: 28,
          alignedAxis: Cartesian3.UNIT_Z, // rotation is measured against this fixed world axis
          rotation: new CallbackProperty(() => {
            const elapsedMs = JulianDate.secondsDifference(viewer.clock.currentTime, startTime) * 1000;
            let nearest = headings[0]!;
            let bestDiff = Infinity;
            for (const h of headings) {
              const diff = Math.abs(h.tMs - elapsedMs);
              if (diff < bestDiff) {
                bestDiff = diff;
                nearest = h;
              }
            }
            return -nearest.heading;
          }, false),
        },
        name: t("map.currentPositionDescription"),
        description: t("map.currentPositionDescription"),
        show: showCurrentPositionRef.current,
      });

      layersRef.current = {
        gcsTrack: gcsPrimitive,
        gpsTrack: gpsPrimitive,
        cleanedTrack: cleanedPrimitive,
        aircraft: aircraftEntity,
        gpsLossMarkers,
      };
    })();

    return () => {
      cancelled = true;
    };
  }, [loaded, t]);

  function toggleGcsTrackVisible() {
    setShowGcsTrack((v) => {
      const next = !v;
      showGcsTrackRef.current = next;
      if (layersRef.current.gcsTrack) layersRef.current.gcsTrack.show = next;
      return next;
    });
  }

  function toggleGpsTrackVisible() {
    setShowGpsTrack((v) => {
      const next = !v;
      showGpsTrackRef.current = next;
      if (layersRef.current.gpsTrack) layersRef.current.gpsTrack.show = next;
      return next;
    });
  }

  function toggleCleanedTrackVisible() {
    setShowCleanedTrack((v) => {
      const next = !v;
      showCleanedTrackRef.current = next;
      if (layersRef.current.cleanedTrack) layersRef.current.cleanedTrack.show = next;
      return next;
    });
  }

  function toggleCurrentPositionVisible() {
    setShowCurrentPosition((v) => {
      const next = !v;
      showCurrentPositionRef.current = next;
      if (layersRef.current.aircraft) layersRef.current.aircraft.show = next;
      return next;
    });
  }

  function toggleGpsLossVisible() {
    setShowGpsLoss((v) => {
      const next = !v;
      showGpsLossRef.current = next;
      for (const marker of layersRef.current.gpsLossMarkers) marker.show = next;
      return next;
    });
  }

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("map.heading")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
            <Input
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={t("map.token.placeholder")}
            />
            <Button onClick={saveToken}>{t("map.token.save")}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasNoMapData = Boolean(loaded && loaded.result === null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("map.heading")}</CardTitle>
        <CardDescription>{t("map.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          role="button"
          aria-disabled={isParsing}
          tabIndex={isParsing ? -1 : 0}
          data-testid="cesium-dropzone"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-6 py-9 text-center transition-colors",
            isParsing && "pointer-events-none opacity-60",
            isDragging ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent",
          )}
        >
          {isParsing ? (
            <span className="font-semibold">{t("map.drop.parsing")}</span>
          ) : (
            <>
              <span className="font-semibold">{t("map.drop.title")}</span>
              <span className="text-sm text-muted-foreground">{t("map.drop.subtitle")}</span>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".bin,.BIN"
          className="sr-only"
          data-testid="cesium-file-input"
          disabled={isParsing}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadSample} disabled={isParsing}>
            {t("logs.sample.bin")}
          </Button>
          <Button variant="ghost" size="sm" onClick={clearToken}>
            {t("map.token.clear")}
          </Button>
        </div>

        {loaded && isFlightMapError(loaded.result) && (
          <Alert variant="destructive">
            <AlertDescription>{loaded.result.error}</AlertDescription>
          </Alert>
        )}
        {loaded && isFlightMapInfo(loaded.result) && (
          <Alert variant="info">
            <AlertDescription>{loaded.result.info}</AlertDescription>
          </Alert>
        )}
        {hasNoMapData && (
          <Alert variant="info">
            <AlertDescription>{t("map.noGpsData")}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
          <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <h3 className="text-sm font-medium">{t("map.legend.heading")}</h3>
            <ul className="flex flex-col gap-2 text-sm">
              <li className="flex items-center gap-2">
                <input type="checkbox" id="show-gcs" checked={showGcsTrack} onChange={toggleGcsTrackVisible} />
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: "#3b82f6" }} />
                <label htmlFor="show-gcs" className="flex-1">
                  {t("map.legend.gcsTrack")}
                </label>
              </li>
              <li className="flex items-center gap-2">
                <input type="checkbox" id="show-gps" checked={showGpsTrack} onChange={toggleGpsTrackVisible} />
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: "#ef4444" }} />
                <label htmlFor="show-gps" className="flex-1">
                  {t("map.legend.gpsTrack")}
                </label>
              </li>
              <li className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="show-cleaned"
                  checked={showCleanedTrack}
                  onChange={toggleCleanedTrackVisible}
                />
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: "#22c55e" }} />
                <label htmlFor="show-cleaned" className="flex-1">
                  {t("map.legend.cleanedTrack")}
                </label>
              </li>
              <li className="flex items-center gap-2">
                <input type="checkbox" id="show-gps-loss" checked={showGpsLoss} onChange={toggleGpsLossVisible} />
                <span aria-hidden className="flex shrink-0 gap-0.5">
                  <span className="h-3 w-3 rounded-full" style={{ background: "#f97316" }} />
                  <span className="h-3 w-3 rounded-full" style={{ background: "#22c55e" }} />
                </span>
                <label htmlFor="show-gps-loss" className="flex-1">
                  {t("map.legend.gpsLoss")}
                </label>
              </li>
              <li className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="show-current"
                  checked={showCurrentPosition}
                  onChange={toggleCurrentPositionVisible}
                />
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: "#ffffff", border: "1px solid #000" }}
                />
                <label htmlFor="show-current" className="flex-1">
                  {t("map.legend.currentPosition")}
                </label>
              </li>
            </ul>
          </section>

          <div
            ref={containerRef}
            data-testid="cesium-map"
            className="h-[560px] w-full rounded-lg border border-border"
          />
        </div>
      </CardContent>
    </Card>
  );
}
