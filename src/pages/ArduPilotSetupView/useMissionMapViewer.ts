import {
  Cartesian2,
  Cartesian3,
  Color,
  HeightReference,
  Ion,
  LabelStyle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Terrain,
  Viewer,
  VerticalOrigin,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useEffect, useRef } from "react";
import type { MissionItemEntry } from "../../stores/mavlinkMissionStore/types";
import { pickLatLon } from "../../utils/cesiumPicking/cesiumPicking";

export type MissionMapPathStyle = "sequence" | "closedPolygon" | "none";

interface UseMissionMapViewerOptions {
  token: string;
  items: MissionItemEntry[];
  markerColor: string;
  pathColor: string;
  pathStyle: MissionMapPathStyle;
  onMapClick: (lat: number, lon: number) => void;
}

/** The Cesium viewer lifecycle + left-click-to-place-point + entity-redraw logic shared by
 *  MissionPlanSection/FencePlanSection/RallyPlanSection - all three are the same "list of
 *  MISSION_ITEM_INT-shaped points on a map, click to add one" editor, differing only in marker/
 *  path color and whether items connect as an ordered route (mission), a closed boundary (fence),
 *  or not at all (rally points are independent, not a path). */
export function useMissionMapViewer({ token, items, markerColor, pathColor, pathStyle, onMapClick }: UseMissionMapViewerOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    if (token) Ion.defaultAccessToken = token;
  }, [token]);

  // A lightweight viewer (no timeline/animation chrome, matching LiveMapSection) plus a
  // left-click handler that drops a new point at the clicked ground location - the
  // click-to-add interaction Mission Planner's own Flight Plan map supports.
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
      const picked = pickLatLon(viewer, movement.position);
      if (!picked) return;
      onMapClickRef.current(picked.lat, picked.lon);
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [token]);

  // Redraws every marker/path segment from scratch on every items change - these lists are small
  // (tens of points, not thousands), so there's no real cost to this over hand-rolled diffing.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.entities.removeAll();
    if (items.length === 0) return;
    const marker = Color.fromCssColorString(markerColor);
    for (const item of items) {
      viewer.entities.add({
        position: Cartesian3.fromDegrees(item.lon, item.lat, item.alt),
        point: { pixelSize: 10, color: marker, heightReference: HeightReference.RELATIVE_TO_GROUND },
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
    if (pathStyle !== "none" && items.length > 1) {
      const positions = items.map((item) => Cartesian3.fromDegrees(item.lon, item.lat, item.alt));
      if (pathStyle === "closedPolygon") positions.push(positions[0]!);
      viewer.entities.add({
        polyline: { positions, width: 2, material: Color.fromCssColorString(pathColor), clampToGround: false },
      });
    }
  }, [items, markerColor, pathColor, pathStyle]);

  return { containerRef };
}
