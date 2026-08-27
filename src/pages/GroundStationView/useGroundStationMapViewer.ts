import {
  Cartesian3,
  Cartographic,
  ConstantPositionProperty,
  Ion,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  sampleTerrainMostDetailed,
  Terrain,
  Viewer,
  type Entity,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useEffect, useRef } from "react";
import { pickLatLon } from "../../utils/cesiumPicking/cesiumPicking";
import type { SiteHome } from "../../stores/groundStationSitesStore/types";

// Identical arrow/house icon convention to LiveMapSection's own vehicle/home markers - a house
// icon reads as "home" the same way across every map in this app.
const HOME_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">' +
    '<path d="M13 3 L23 12 H19 V23 H7 V12 H3 Z" fill="#22c55e" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>' +
    "</svg>",
);
const HOME_ICON = `data:image/svg+xml,${HOME_SVG}`;
// Camera height above the placed home the first time it's set, in meters - same purpose as
// LiveMapSection's FOLLOW_HEIGHT_M, just for a one-time reveal instead of a per-tick follow.
const HOME_REVEAL_HEIGHT_M = 800;

interface UseGroundStationMapViewerOptions {
  token: string;
  home: SiteHome | null;
  /** True while "Set Home" is the active click mode - a plain left-click otherwise just pans/
   *  rotates the map (Cesium's own default), same "explicit mode, not every click does
   *  something" convention as this app's other map-click interactions. */
  placingHome: boolean;
  onPlaceHome: (home: SiteHome) => void;
}

/**
 * The Cesium viewer lifecycle for Ground Station's planning map: camera locked to a top-down
 * view (tilt disabled - this is a planning tool, not a flight-review 3D view), a "Set Home"
 * click-to-place mode that samples the real terrain height at the clicked point, and the home
 * marker's own lifecycle. Beacon/antenna placement and the coverage overlay land in later
 * phases - this hook only knows about `home` for now.
 */
export function useGroundStationMapViewer({ token, home, placingHome, onPlaceHome }: UseGroundStationMapViewerOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const homeMarkerRef = useRef<Entity | null>(null);
  // Mirrors the latest placingHome/onPlaceHome for the click handler's closure below, which is
  // set up once per Cesium viewer lifetime (see the token-keyed effect), not per render - same
  // pattern LiveMapSection/useMissionMapViewer already use for their own map-click handlers.
  const placingHomeRef = useRef(placingHome);
  const onPlaceHomeRef = useRef(onPlaceHome);
  useEffect(() => {
    placingHomeRef.current = placingHome;
    onPlaceHomeRef.current = onPlaceHome;
  }, [placingHome, onPlaceHome]);

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

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
      homeMarkerRef.current = null;
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

  return { containerRef };
}
