import {
  Cartesian3,
  Cartographic,
  Color,
  ColorMaterialProperty,
  ConstantPositionProperty,
  ConstantProperty,
  ImageMaterialProperty,
  Ion,
  Math as CesiumMath,
  PolygonHierarchy,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  sampleTerrainMostDetailed,
  Terrain,
  Viewer,
  type Entity,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useEffect, useRef, useState } from "react";
import { destinationPoint } from "../../utils/geo/geo";
import { pickLatLon } from "../../utils/cesiumPicking/cesiumPicking";
import type { SiteDevice, SiteHome } from "../../stores/groundStationSitesStore/types";
import { computeCoverageRaster, type CoverageLevel, type CoverageRaster } from "./coverageRaster";
import { lobeOutline } from "./lobeGeometry";

// Identical arrow/house icon convention to LiveMapSection's own vehicle/home markers - a house
// icon reads as "home" the same way across every map in this app.
const HOME_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">' +
    '<path d="M13 3 L23 12 H19 V23 H7 V12 H3 Z" fill="#22c55e" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>' +
    "</svg>",
);
const HOME_ICON = `data:image/svg+xml,${HOME_SVG}`;
const BEACON_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">' +
    '<circle cx="11" cy="11" r="8" fill="#a855f7" stroke="black" stroke-width="1.5"/>' +
    "</svg>",
);
const BEACON_ICON = `data:image/svg+xml,${BEACON_SVG}`;
const ANTENNA_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">' +
    '<path d="M11 2 L16 20 H6 Z" fill="#3b82f6" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>' +
    "</svg>",
);
const ANTENNA_ICON = `data:image/svg+xml,${ANTENNA_SVG}`;
const BEACON_COLOR = Color.fromCssColorString("#a855f7");
const ANTENNA_COLOR = Color.fromCssColorString("#3b82f6");
// Camera height above the placed home the first time it's set, in meters - same purpose as
// LiveMapSection's FOLLOW_HEIGHT_M, just for a one-time reveal instead of a per-tick follow.
const HOME_REVEAL_HEIGHT_M = 800;

// Standard good/warning/critical semantic colors, matching the plan's own "green/yellow/red"
// wording - separate from the purple/blue identity colors above, which mark WHOSE lobe this is,
// not how well it covers.
const COVERAGE_COLORS: Record<CoverageLevel, [number, number, number]> = {
  clear: [34, 197, 94],
  marginal: [234, 179, 8],
  blocked: [239, 68, 68],
};

interface UseGroundStationMapViewerOptions {
  token: string;
  home: SiteHome | null;
  /** True while "Set Home" is the active click mode - a plain left-click otherwise just pans/
   *  rotates the map (Cesium's own default), same "explicit mode, not every click does
   *  something" convention as this app's other map-click interactions. */
  placingHome: boolean;
  onPlaceHome: (home: SiteHome) => void;
  devices: SiteDevice[];
  selectedDeviceId: string | null;
  /** Fired on a right-click anywhere on the map - mirrors LiveMapSection's own right-click
   *  popup convention. The component owns the resulting context-menu UI and decides what (if
   *  anything) to place there; this hook only reports where the click landed. */
  onMapRightClick: (screenX: number, screenY: number, lat: number, lon: number) => void;
  /** Which devices' line-of-sight coverage raster should currently be drawn - a per-device view
   *  toggle (see the Devices panel), not persisted site data, since it's just "what am I looking
   *  at right now." */
  coverageDeviceIds: ReadonlySet<string>;
}

/**
 * The Cesium viewer lifecycle for Ground Station's planning map: camera locked to a top-down
 * view (tilt disabled - this is a planning tool, not a flight-review 3D view), a "Set Home"
 * click-to-place mode, a right-click hook for placing beacons/antennas, the home/device marker
 * + coverage-lobe lifecycle, and a per-device line-of-sight coverage raster (computeCoverageRaster
 * in coverageRaster.ts) drawn as ONE ground-draped image per toggled device - deliberately not
 * one Cesium entity per grid cell, which is the standard way this kind of overlay becomes a real
 * rendering-performance problem; see the Ground Station plan's own flagged risk for this phase.
 */
export function useGroundStationMapViewer({
  token,
  home,
  placingHome,
  onPlaceHome,
  devices,
  selectedDeviceId,
  onMapRightClick,
  coverageDeviceIds,
}: UseGroundStationMapViewerOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const homeMarkerRef = useRef<Entity | null>(null);
  const deviceEntitiesRef = useRef(new Map<string, { marker: Entity; lobe: Entity }>());
  const coverageEntitiesRef = useRef(new Map<string, { entity: Entity; deviceKey: string }>());
  const [coverageLoadingIds, setCoverageLoadingIds] = useState<ReadonlySet<string>>(new Set());
  // Mirrors the latest placingHome/onPlaceHome/onMapRightClick for the click handlers' closures
  // below, which are set up once per Cesium viewer lifetime (see the token-keyed effect), not
  // per render - same pattern LiveMapSection/useMissionMapViewer already use for their own
  // map-click handlers.
  const placingHomeRef = useRef(placingHome);
  const onPlaceHomeRef = useRef(onPlaceHome);
  const onMapRightClickRef = useRef(onMapRightClick);
  useEffect(() => {
    placingHomeRef.current = placingHome;
    onPlaceHomeRef.current = onPlaceHome;
    onMapRightClickRef.current = onMapRightClick;
  }, [placingHome, onPlaceHome, onMapRightClick]);

  useEffect(() => {
    if (token) Ion.defaultAccessToken = token;
  }, [token]);

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

    // Locks the view to straight-down (a planning task wants precise placement, not 3D
    // navigation) - disabling tilt keeps every future pan/zoom gesture from ever leaving this
    // orientation, rather than just setting it once and letting the user tilt away again.
    viewer.scene.screenSpaceCameraController.enableTilt = false;
    viewer.camera.setView({ orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 } });

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: ScreenSpaceEventHandler.PositionedEvent) => {
      if (!placingHomeRef.current) return;
      const picked = pickLatLon(viewer, movement.position);
      if (!picked) return;
      void sampleTerrainMostDetailed(viewer.terrainProvider, [Cartographic.fromDegrees(picked.lon, picked.lat)]).then(([sample]) => {
        // The viewer this closure captured may have been destroyed (token cleared, or this
        // whole map unmounted) while the terrain sample was still in flight - see the fixed
        // bug in LiveMapSection.tsx for why this check matters.
        if (viewer.isDestroyed()) return;
        onPlaceHomeRef.current({ lat: picked.lat, lon: picked.lon, altitudeM: sample?.height ?? 0 });
      });
    }, ScreenSpaceEventType.LEFT_CLICK);

    // Right-click always opens the beacon/antenna popup, independent of "Set Home" mode - the
    // same interaction LiveMapSection's own Fly-to/Set-home-here menu uses, rather than a
    // second explicit toggle button.
    handler.setInputAction((movement: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = pickLatLon(viewer, movement.position);
      if (!picked) return;
      onMapRightClickRef.current(movement.position.x, movement.position.y, picked.lat, picked.lon);
    }, ScreenSpaceEventType.RIGHT_CLICK);

    // Captured once per effect run (the ref's own Map identity never changes after useRef's
    // initial value, only its contents do) so the cleanup below reads a value React's linter
    // can prove hasn't been reassigned out from under it, rather than `.current` at cleanup time.
    const deviceEntities = deviceEntitiesRef.current;
    const coverageEntities = coverageEntitiesRef.current;
    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
      homeMarkerRef.current = null;
      deviceEntities.clear();
      coverageEntities.clear();
    };
  }, [token]);

  // Draws/updates the home marker - flies the camera there only the first time a marker is
  // created (a brand new site starts at Cesium's own default world view, which is nowhere near
  // the real site), not on every later edit (re-placing home, or just tweaking the altitude
  // override), which would otherwise yank the camera away from wherever the user is looking.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (!home) {
      if (homeMarkerRef.current) {
        viewer.entities.remove(homeMarkerRef.current);
        homeMarkerRef.current = null;
      }
      return;
    }
    const position = Cartesian3.fromDegrees(home.lon, home.lat, home.altitudeM);
    if (!homeMarkerRef.current) {
      homeMarkerRef.current = viewer.entities.add({
        position,
        billboard: { image: HOME_ICON, width: 28, height: 28 },
      });
      viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(home.lon, home.lat, home.altitudeM + HOME_REVEAL_HEIGHT_M) });
    } else {
      homeMarkerRef.current.position = new ConstantPositionProperty(position);
    }
  }, [home]);

  // Redraws every device's marker + coverage-lobe outline from scratch's worth of data on every
  // devices/selection change - these lists are small (tens of devices, not thousands), so
  // there's no real cost to this over hand-rolled diffing (matches useMissionMapViewer's own
  // reasoning for its marker/path redraw).
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const seen = new Set(devices.map((d) => d.id));
    for (const [id, entities] of deviceEntitiesRef.current) {
      if (seen.has(id)) continue;
      viewer.entities.remove(entities.marker);
      viewer.entities.remove(entities.lobe);
      deviceEntitiesRef.current.delete(id);
    }

    for (const device of devices) {
      const baseColor = device.kind === "beacon" ? BEACON_COLOR : ANTENNA_COLOR;
      const isSelected = device.id === selectedDeviceId;
      const position = Cartesian3.fromDegrees(device.lon, device.lat, device.altitudeM);
      const hierarchy = new PolygonHierarchy(Cartesian3.fromDegreesArray(lobeOutline(device).flat()));
      const fill = baseColor.withAlpha(isSelected ? 0.45 : 0.22);
      const outlineColor = isSelected ? Color.WHITE : baseColor;

      const existing = deviceEntitiesRef.current.get(device.id);
      if (!existing) {
        const marker = viewer.entities.add({
          position,
          billboard: { image: device.kind === "beacon" ? BEACON_ICON : ANTENNA_ICON, width: 22, height: 22 },
        });
        const lobe = viewer.entities.add({
          polygon: { hierarchy, material: new ColorMaterialProperty(fill), outline: true, outlineColor },
        });
        deviceEntitiesRef.current.set(device.id, { marker, lobe });
      } else {
        existing.marker.position = new ConstantPositionProperty(position);
        if (existing.lobe.polygon) {
          existing.lobe.polygon.hierarchy = new ConstantProperty(hierarchy);
          existing.lobe.polygon.material = new ColorMaterialProperty(fill);
          existing.lobe.polygon.outlineColor = new ConstantProperty(outlineColor);
        }
      }
    }
  }, [devices, selectedDeviceId]);

  // Computes (or re-computes, if the device's own coverage-relevant fields changed since the
  // last draw) and draws a line-of-sight coverage raster for every device currently toggled on,
  // and removes any raster that got toggled off or whose device no longer exists. Each device's
  // raster is ONE ground-draped image entity, not one entity per grid cell - see this hook's own
  // doc comment for why that matters.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    for (const [deviceId, { entity }] of coverageEntitiesRef.current) {
      if (coverageDeviceIds.has(deviceId) && devices.some((d) => d.id === deviceId)) continue;
      viewer.entities.remove(entity);
      coverageEntitiesRef.current.delete(deviceId);
    }

    for (const deviceId of coverageDeviceIds) {
      const device = devices.find((d) => d.id === deviceId);
      if (!device) continue;
      const key = coverageDeviceKey(device);
      const existing = coverageEntitiesRef.current.get(deviceId);
      if (existing?.deviceKey === key) continue;

      setCoverageLoadingIds((prev) => new Set(prev).add(deviceId));
      void computeCoverageRaster({ device, sampleTerrain: (points) => sampleTerrainBatch(viewer, points) }).then((raster) => {
        // Same stale-async guard as Set-Home/sampleAltitude above, plus two more ways this
        // specific result can now be outdated: the device was toggled back off, or its fields
        // (range, pattern, ...) changed again while this batch was still in flight.
        setCoverageLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(deviceId);
          return next;
        });
        if (viewer.isDestroyed() || !coverageDeviceIds.has(deviceId)) return;
        const currentDevice = devices.find((d) => d.id === deviceId);
        if (!currentDevice || coverageDeviceKey(currentDevice) !== key) return;

        const previous = coverageEntitiesRef.current.get(deviceId);
        if (previous) viewer.entities.remove(previous.entity);
        const entity = viewer.entities.add({
          rectangle: { coordinates: coverageBounds(device), material: new ImageMaterialProperty({ image: rasterToCanvas(raster) }) },
        });
        coverageEntitiesRef.current.set(deviceId, { entity, deviceKey: key });
      });
    }
  }, [devices, coverageDeviceIds]);

  // Samples the real terrain height at a clicked point, for the caller to build a new device
  // from - same terrain-sampling technique as the Set-Home flow above, just returned to the
  // caller (the context menu's "Add beacon/antenna here" click) instead of firing a callback
  // directly, since device placement also needs to pick a kind and a default preset.
  async function sampleAltitude(lat: number, lon: number): Promise<number> {
    const viewer = viewerRef.current;
    if (!viewer) return 0;
    const [sample] = await sampleTerrainMostDetailed(viewer.terrainProvider, [Cartographic.fromDegrees(lon, lat)]);
    return sample?.height ?? 0;
  }

  return { containerRef, sampleAltitude, coverageLoadingIds };
}

/** Every field a coverage raster's shape/classification actually depends on - used to tell "the
 *  device moved/changed" apart from "an unrelated field (name, presetId) changed," so editing a
 *  device's name doesn't trigger a full terrain re-sample. */
function coverageDeviceKey(device: SiteDevice): string {
  return [device.lat, device.lon, device.altitudeM, device.pattern, device.rangeM, device.bearingDeg, device.beamwidthDeg].join("|");
}

async function sampleTerrainBatch(viewer: Viewer, points: { lat: number; lon: number }[]): Promise<number[]> {
  const cartographics = points.map((p) => Cartographic.fromDegrees(p.lon, p.lat));
  const samples = await sampleTerrainMostDetailed(viewer.terrainProvider, cartographics);
  return samples.map((s) => s?.height ?? 0);
}

/** The square area a device's raster was sampled over - the same `rangeM` offset in every
 *  cardinal direction the raster's own grid spans (see coverageRaster.ts's cell-placement math),
 *  so the drawn image lines up exactly with the cells it was built from. */
function coverageBounds(device: Pick<SiteDevice, "lat" | "lon" | "rangeM">): Rectangle {
  const north = destinationPoint(device.lat, device.lon, 0, device.rangeM);
  const east = destinationPoint(device.lat, device.lon, 90, device.rangeM);
  const south = destinationPoint(device.lat, device.lon, 180, device.rangeM);
  const west = destinationPoint(device.lat, device.lon, 270, device.rangeM);
  return Rectangle.fromDegrees(west.lon, south.lat, east.lon, north.lat);
}

// Translucent, matching the device lobe outline's own alpha convention - this is a coverage
// overlay drawn ON TOP of that lobe, not a replacement for it.
const COVERAGE_ALPHA = 140;

function rasterToCanvas(raster: CoverageRaster): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = raster.gridResolution;
  canvas.height = raster.gridResolution;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(raster.gridResolution, raster.gridResolution);
  for (const cell of raster.cells) {
    const [r, g, b] = COVERAGE_COLORS[cell.level];
    // Image data's row 0 is the top of the canvas; coverageRaster's row 0 is the south edge -
    // flipped here so the drawn image isn't mirrored north-to-south once draped on the map.
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
