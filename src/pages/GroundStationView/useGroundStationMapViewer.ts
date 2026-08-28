import { Map as MapLibreMap, Marker, setWorkerUrl, type GeoJSONSource, type LngLatLike, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre resolves its own tile-parsing Web Worker via `new URL(..., import.meta.url)`, which
// doesn't survive Rolldown's bundling into a working same-origin path (confirmed: the request
// for it 404s and falls back to index.html's own HTML, since this is a client-routed SPA). A
// plain `?url` import isn't enough either - the worker's own .mjs imports a sibling
// maplibre-gl-shared.mjs chunk, which `?url` doesn't bundle (it just copies the file verbatim),
// so the worker fails on ITS OWN first import once served raw. `?worker&url` routes it through
// Vite's worker pipeline instead, producing a self-contained chunk with that dependency inlined.
// `setWorkerUrl` (called once, at module load, before any Map is constructed) points MapLibre at
// this real built path rather than relying on its own broken auto-resolution.
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { Feature, Polygon } from "geojson";
import { useEffect, useRef, useState } from "react";
import type { SiteDevice, SiteHome } from "../../stores/groundStationSitesStore/types";
import { computeCoverageRaster, type CoverageLevel, type CoverageRaster } from "./coverageRaster";
import { lobeOutline } from "./lobeGeometry";
import { sampleTerrainElevations } from "./terrainElevation";

setWorkerUrl(maplibreWorkerUrl);

// OpenFreeMap's public instance: free, unlimited, no API key or signup (unlike Cesium ion, which
// this page used through Phase 3) - see https://openfreemap.org. Attribution is added
// automatically by MapLibre's own AttributionControl.
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const TERRAIN_TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const DEFAULT_CENTER: LngLatLike = [0, 20];
const DEFAULT_ZOOM = 2;
const HOME_REVEAL_ZOOM = 15;

const HOME_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">' +
    '<path d="M13 3 L23 12 H19 V23 H7 V12 H3 Z" fill="#22c55e" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>' +
    "</svg>",
);
const BEACON_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">' +
    '<circle cx="11" cy="11" r="8" fill="#a855f7" stroke="black" stroke-width="1.5"/>' +
    "</svg>",
);
const ANTENNA_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">' +
    '<path d="M11 2 L16 20 H6 Z" fill="#3b82f6" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>' +
    "</svg>",
);
const BEACON_COLOR = "#a855f7";
const ANTENNA_COLOR = "#3b82f6";
const COVERAGE_COLORS: Record<CoverageLevel, [number, number, number]> = {
  clear: [34, 197, 94],
  marginal: [234, 179, 8],
  blocked: [239, 68, 68],
};
const COVERAGE_ALPHA = 140;

function markerElement(svgDataUri: string, sizePx: number): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = `${sizePx}px`;
  el.style.height = `${sizePx}px`;
  el.style.backgroundImage = `url(data:image/svg+xml,${svgDataUri})`;
  el.style.backgroundSize = "contain";
  el.style.backgroundRepeat = "no-repeat";
  el.style.cursor = "pointer";
  return el;
}

interface DeviceContextMenuLocation {
  screenX: number;
  screenY: number;
  lat: number;
  lon: number;
}

interface UseGroundStationMapViewerOptions {
  home: SiteHome | null;
  /** True while "Set Home" is the active click mode - a plain left-click otherwise just pans the
   *  map, same "explicit mode, not every click does something" convention as this app's other
   *  map-click interactions. */
  placingHome: boolean;
  onPlaceHome: (home: SiteHome) => void;
  devices: SiteDevice[];
  selectedDeviceId: string | null;
  onSelectDevice: (id: string) => void;
  /** Fired after a marker (home, beacon, or antenna) is dragged to a new spot - already
   *  terrain-sampled for altitude, same as a fresh placement, since dropping something
   *  somewhere new is conceptually the same action as placing it there in the first place. */
  onDeviceMoved: (id: string, lat: number, lon: number, altitudeM: number) => void;
  /** Fired on a right-click anywhere on the map - the component owns the resulting context-menu
   *  UI and decides what (if anything) to place there; this hook only reports where the click
   *  landed, in both screen pixels (for menu positioning) and lat/lon. */
  onMapRightClick: (location: DeviceContextMenuLocation) => void;
  /** Which devices' line-of-sight coverage raster should currently be drawn - a per-device view
   *  toggle (see the Devices panel), not persisted site data. */
  coverageDeviceIds: ReadonlySet<string>;
}

function lobeGeoJson(device: SiteDevice): Feature<Polygon> {
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [lobeOutline(device)] } };
}

/**
 * The MapLibre viewer lifecycle for Ground Station's planning map: a plain 2D top-down view
 * (MapLibre has no tilt to lock in the first place, unlike the Cesium 3D globe this replaced),
 * OpenFreeMap for the base layer and AWS's public Terrarium tiles for terrain elevation - both
 * free with no API key, removing the token-entry step this page needed through Phase 3.
 *
 * Every marker (home, beacon, antenna) is draggable and clickable - dragging re-samples terrain
 * for the new position (see onDeviceMoved), clicking selects a device. A right-click anywhere
 * opens the beacon/antenna placement popup the component renders. Each device's coverage raster
 * (computeCoverageRaster in coverageRaster.ts) is drawn as ONE MapLibre image source per toggled
 * device, not one feature per grid cell - deliberately avoided for the same rendering-cost reason
 * the Cesium version avoided one-entity-per-cell.
 */
export function useGroundStationMapViewer({
  home,
  placingHome,
  onPlaceHome,
  devices,
  selectedDeviceId,
  onSelectDevice,
  onDeviceMoved,
  onMapRightClick,
  coverageDeviceIds,
}: UseGroundStationMapViewerOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // MapLibre's Map has no public "was this instance removed" query (unlike Cesium's own
  // isDestroyed()) - tracked ourselves instead of reaching for the underscore-prefixed internal
  // `map._removed` field, so an in-flight terrain sample from a since-unmounted map doesn't call
  // back into stale state.
  const removedRef = useRef(false);
  const [styleLoaded, setStyleLoaded] = useState(false);
  const homeMarkerRef = useRef<Marker | null>(null);
  const deviceMarkersRef = useRef(new Map<string, Marker>());
  const coverageLayersRef = useRef(new Map<string, { deviceKey: string }>());
  const [coverageLoadingIds, setCoverageLoadingIds] = useState<ReadonlySet<string>>(new Set());

  // Mirrors the latest callback/mode props for closures set up once per map lifetime (the
  // load-once effect below), not per render - same pattern this hook's Cesium predecessor used.
  const placingHomeRef = useRef(placingHome);
  const onPlaceHomeRef = useRef(onPlaceHome);
  const onMapRightClickRef = useRef(onMapRightClick);
  const onSelectDeviceRef = useRef(onSelectDevice);
  const onDeviceMovedRef = useRef(onDeviceMoved);
  useEffect(() => {
    placingHomeRef.current = placingHome;
    onPlaceHomeRef.current = onPlaceHome;
    onMapRightClickRef.current = onMapRightClick;
    onSelectDeviceRef.current = onSelectDevice;
    onDeviceMovedRef.current = onDeviceMoved;
  }, [placingHome, onPlaceHome, onMapRightClick, onSelectDevice, onDeviceMoved]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      // A planning tool wants precise top-down placement, not 3D navigation - maxPitch: 0 makes
      // tilting impossible outright, rather than resetting it after the fact.
      maxPitch: 0,
      attributionControl: { compact: true },
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    // The container is positioned via `absolute inset-0` inside a flex layout - if its parent
    // hasn't finished sizing itself yet at the exact moment this effect runs (a real, commonly
    // hit MapLibre/Mapbox GL timing issue), the map can construct against a 0x0 (or otherwise
    // stale) container size and never repaint correctly afterward without an explicit resize().
    // A ResizeObserver catches both that initial case and any later layout change (sidebar
    // width changing, window resize) uniformly.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    map.on("load", () => {
      map.addSource("terrain-dem", { type: "raster-dem", tiles: [TERRAIN_TILE_URL], tileSize: 256, encoding: "terrarium" });
      map.addLayer({ id: "hillshade", type: "hillshade", source: "terrain-dem", paint: { "hillshade-exaggeration": 0.3 } });
      setStyleLoaded(true);
    });

    map.on("click", (e: MapMouseEvent) => {
      if (!placingHomeRef.current) return;
      const { lng, lat } = e.lngLat;
      void sampleTerrainElevations([{ lat, lon: lng }]).then(([height]) => {
        // The map this closure captured may have been removed (unmount) while the terrain
        // sample was still in flight.
        if (removedRef.current) return;
        onPlaceHomeRef.current({ lat, lon: lng, altitudeM: height ?? 0 });
      });
    });

    map.on("contextmenu", (e: MapMouseEvent) => {
      e.preventDefault();
      onMapRightClickRef.current({ screenX: e.point.x, screenY: e.point.y, lat: e.lngLat.lat, lon: e.lngLat.lng });
    });

    // Captured once per effect run (the refs' own Map identities never change after useRef's
    // initial value, only their contents do) so the cleanup below reads values React's linter
    // can prove haven't been reassigned out from under it, rather than `.current` at cleanup time.
    const deviceMarkers = deviceMarkersRef.current;
    const coverageLayers = coverageLayersRef.current;
    return () => {
      removedRef.current = true;
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      homeMarkerRef.current = null;
      deviceMarkers.clear();
      coverageLayers.clear();
      setStyleLoaded(false);
    };
  }, []);

  // Draws/updates the home marker - flies the camera there only the first time a marker is
  // created (a brand new site starts at a neutral world view, nowhere near the real site), not
  // on every later edit (re-placing home, or a drag), which would otherwise yank the camera away
  // from wherever the user is looking.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    if (!home) {
      homeMarkerRef.current?.remove();
      homeMarkerRef.current = null;
      return;
    }
    const lngLat: LngLatLike = [home.lon, home.lat];
    if (!homeMarkerRef.current) {
      const marker = new Marker({ element: markerElement(HOME_SVG, 28), draggable: true, anchor: "center" }).setLngLat(lngLat).addTo(map);
      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        void sampleTerrainElevations([{ lat, lon: lng }]).then(([height]) => {
          if (removedRef.current) return;
          onPlaceHomeRef.current({ lat, lon: lng, altitudeM: height ?? 0 });
        });
      });
      homeMarkerRef.current = marker;
      map.flyTo({ center: lngLat, zoom: HOME_REVEAL_ZOOM });
    } else {
      homeMarkerRef.current.setLngLat(lngLat);
    }
  }, [home, styleLoaded]);

  // Redraws every device's marker + coverage-lobe outline from scratch's worth of data on every
  // devices/selection change - small lists (tens of devices, not thousands), so no real cost
  // over hand-rolled diffing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;

    const seen = new Set(devices.map((d) => d.id));
    for (const [id, marker] of deviceMarkersRef.current) {
      if (seen.has(id)) continue;
      marker.remove();
      deviceMarkersRef.current.delete(id);
      removeLobeLayers(map, id);
    }

    for (const device of devices) {
      const isSelected = device.id === selectedDeviceId;
      const baseColor = device.kind === "beacon" ? BEACON_COLOR : ANTENNA_COLOR;
      const lngLat: LngLatLike = [device.lon, device.lat];
      const geoJson = lobeGeoJson(device);

      const source = map.getSource<GeoJSONSource>(lobeSourceId(device.id));
      if (!source) {
        map.addSource(lobeSourceId(device.id), { type: "geojson", data: geoJson });
        map.addLayer({
          id: lobeFillLayerId(device.id),
          type: "fill",
          source: lobeSourceId(device.id),
          paint: { "fill-color": baseColor, "fill-opacity": isSelected ? 0.45 : 0.22 },
        });
        map.addLayer({
          id: lobeLineLayerId(device.id),
          type: "line",
          source: lobeSourceId(device.id),
          paint: { "line-color": isSelected ? "#ffffff" : baseColor, "line-width": 2 },
        });
      } else {
        void source.setData(geoJson);
        map.setPaintProperty(lobeFillLayerId(device.id), "fill-opacity", isSelected ? 0.45 : 0.22);
        map.setPaintProperty(lobeLineLayerId(device.id), "line-color", isSelected ? "#ffffff" : baseColor);
      }

      const existingMarker = deviceMarkersRef.current.get(device.id);
      if (!existingMarker) {
        const element = markerElement(device.kind === "beacon" ? BEACON_SVG : ANTENNA_SVG, 22);
        element.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectDeviceRef.current(device.id);
        });
        const marker = new Marker({ element, draggable: true, anchor: "center" }).setLngLat(lngLat).addTo(map);
        marker.on("dragend", () => {
          const { lng, lat } = marker.getLngLat();
          void sampleTerrainElevations([{ lat, lon: lng }]).then(([height]) => {
            if (removedRef.current) return;
            onDeviceMovedRef.current(device.id, lat, lng, height ?? 0);
          });
        });
        deviceMarkersRef.current.set(device.id, marker);
      } else {
        existingMarker.setLngLat(lngLat);
      }
    }
  }, [devices, selectedDeviceId, styleLoaded]);

  // Computes (or re-computes, if the device's own coverage-relevant fields changed since the
  // last draw) and draws a line-of-sight coverage raster for every device currently toggled on,
  // and removes any raster that got toggled off or whose device no longer exists.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;

    for (const [deviceId] of coverageLayersRef.current) {
      if (coverageDeviceIds.has(deviceId) && devices.some((d) => d.id === deviceId)) continue;
      removeCoverageLayer(map, deviceId);
      coverageLayersRef.current.delete(deviceId);
    }

    for (const deviceId of coverageDeviceIds) {
      const device = devices.find((d) => d.id === deviceId);
      if (!device) continue;
      const key = coverageDeviceKey(device);
      const existing = coverageLayersRef.current.get(deviceId);
      if (existing?.deviceKey === key) continue;

      setCoverageLoadingIds((prev) => new Set(prev).add(deviceId));
      void computeCoverageRaster({ device, sampleTerrain: sampleTerrainElevations }).then((raster) => {
        setCoverageLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(deviceId);
          return next;
        });
        // Same stale-async guard family as elsewhere in this hook, plus two more ways this
        // specific result can now be outdated: toggled back off, or the device's fields changed
        // again while this batch was still in flight.
        if (removedRef.current || !coverageDeviceIds.has(deviceId)) return;
        const currentDevice = devices.find((d) => d.id === deviceId);
        if (!currentDevice || coverageDeviceKey(currentDevice) !== key) return;

        removeCoverageLayer(map, deviceId);
        const canvas = rasterToCanvas(raster);
        map.addSource(coverageSourceId(deviceId), { type: "image", url: canvas.toDataURL(), coordinates: coverageCorners(device) });
        map.addLayer({ id: coverageLayerId(deviceId), type: "raster", source: coverageSourceId(deviceId), paint: { "raster-opacity": 1 } });
        coverageLayersRef.current.set(deviceId, { deviceKey: key });
      });
    }
  }, [devices, coverageDeviceIds, styleLoaded]);

  async function sampleAltitude(lat: number, lon: number): Promise<number> {
    const [height] = await sampleTerrainElevations([{ lat, lon }]);
    return height ?? 0;
  }

  return { containerRef, sampleAltitude, coverageLoadingIds };
}

function lobeSourceId(deviceId: string) {
  return `device-lobe-${deviceId}`;
}
function lobeFillLayerId(deviceId: string) {
  return `device-lobe-fill-${deviceId}`;
}
function lobeLineLayerId(deviceId: string) {
  return `device-lobe-line-${deviceId}`;
}
function coverageSourceId(deviceId: string) {
  return `device-coverage-${deviceId}`;
}
function coverageLayerId(deviceId: string) {
  return `device-coverage-layer-${deviceId}`;
}

function removeLobeLayers(map: MapLibreMap, deviceId: string) {
  if (map.getLayer(lobeFillLayerId(deviceId))) map.removeLayer(lobeFillLayerId(deviceId));
  if (map.getLayer(lobeLineLayerId(deviceId))) map.removeLayer(lobeLineLayerId(deviceId));
  if (map.getSource(lobeSourceId(deviceId))) map.removeSource(lobeSourceId(deviceId));
}

function removeCoverageLayer(map: MapLibreMap, deviceId: string) {
  if (map.getLayer(coverageLayerId(deviceId))) map.removeLayer(coverageLayerId(deviceId));
  if (map.getSource(coverageSourceId(deviceId))) map.removeSource(coverageSourceId(deviceId));
}

/** Every field a coverage raster's shape/classification actually depends on - used to tell "the
 *  device moved/changed" apart from "an unrelated field (name, presetId) changed," so editing a
 *  device's name doesn't trigger a full terrain re-sample. */
function coverageDeviceKey(device: SiteDevice): string {
  return [device.lat, device.lon, device.altitudeM, device.pattern, device.rangeM, device.bearingDeg, device.beamwidthDeg].join("|");
}

/** The four corners of a device's raster in MapLibre's own image-source order (top-left,
 *  top-right, bottom-right, bottom-left) - the same square area (rangeM in every cardinal
 *  direction) the raster's own grid was sampled over, so the drawn image lines up with the
 *  cells it was built from. */
function coverageCorners(
  device: Pick<SiteDevice, "lat" | "lon" | "rangeM">,
): [[number, number], [number, number], [number, number], [number, number]] {
  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos((device.lat * Math.PI) / 180);
  const dLat = device.rangeM / metersPerDegLat;
  const dLon = device.rangeM / metersPerDegLon;
  const north = device.lat + dLat;
  const south = device.lat - dLat;
  const west = device.lon - dLon;
  const east = device.lon + dLon;
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
}

function rasterToCanvas(raster: CoverageRaster): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = raster.gridResolution;
  canvas.height = raster.gridResolution;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(raster.gridResolution, raster.gridResolution);
  for (const cell of raster.cells) {
    const [r, g, b] = COVERAGE_COLORS[cell.level];
    // Image data's row 0 is the top of the canvas; coverageRaster's row 0 is the south edge -
    // flipped here so the drawn image isn't mirrored north-to-south once placed on the map.
    const imageRow = raster.gridResolution - 1 - cell.row;
    const idx = (imageRow * raster.gridResolution + cell.col) * 4;
    image.data[idx] = r;
    image.data[idx + 1] = g;
    image.data[idx + 2] = b;
    image.data[idx + 3] = COVERAGE_ALPHA;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
