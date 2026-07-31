import type { GeoJSONSource, Map as MaplibreMap } from "maplibre-gl";
import type { FlightMapData, GpsLossRegion, TrackPoint } from "../../analysis/flight-map/types";

export type TrackKey = "gcsTrack" | "gpsTrack" | "cleanedTrack";

export const TRACK_KEYS: readonly TrackKey[] = ["gcsTrack", "gpsTrack", "cleanedTrack"];

export const TRACK_COLORS: Record<TrackKey, string> = {
  gcsTrack: "#3b82f6", // blue - fused/GCS position
  gpsTrack: "#ef4444", // red - raw GPS, includes spoofed excursions
  cleanedTrack: "#22c55e", // green - raw GPS after teleport rejection
};

const LOSS_SOURCE_ID = "flight-map-gps-loss";
const LOSS_LAYER_ID = "flight-map-gps-loss-layer";
const TRACK_SOURCE_ID: Record<TrackKey, string> = {
  gcsTrack: "flight-map-gcs-track",
  gpsTrack: "flight-map-gps-track",
  cleanedTrack: "flight-map-cleaned-track",
};
const TRACK_LAYER_ID: Record<TrackKey, string> = {
  gcsTrack: "flight-map-gcs-track-layer",
  gpsTrack: "flight-map-gps-track-layer",
  cleanedTrack: "flight-map-cleaned-track-layer",
};

function toLineFeature(points: TrackPoint[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: points.map((p) => [p.lon, p.lat]) },
  };
}

function toLossFeatureCollection(regions: GpsLossRegion[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: regions
      .filter((r): r is GpsLossRegion & { lat: number; lon: number } => r.lat !== null && r.lon !== null)
      .map((r) => ({
        type: "Feature",
        properties: { alt: r.alt, startMs: r.startMs, endMs: r.endMs },
        geometry: { type: "Point", coordinates: [r.lon, r.lat] },
      })),
  };
}

/** Idempotently creates the track/loss-region sources and layers if they don't exist yet. */
export function ensureFlightMapLayers(map: MaplibreMap): void {
  for (const key of TRACK_KEYS) {
    if (!map.getSource(TRACK_SOURCE_ID[key])) {
      map.addSource(TRACK_SOURCE_ID[key], {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: TRACK_LAYER_ID[key],
        type: "line",
        source: TRACK_SOURCE_ID[key],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": TRACK_COLORS[key], "line-width": 3 },
      });
    }
  }
  if (!map.getSource(LOSS_SOURCE_ID)) {
    map.addSource(LOSS_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: LOSS_LAYER_ID,
      type: "circle",
      source: LOSS_SOURCE_ID,
      paint: {
        "circle-radius": 8,
        "circle-color": "#f97316",
        "circle-opacity": 0.85,
        "circle-stroke-color": "#7c2d12",
        "circle-stroke-width": 1.5,
      },
    });
  }
}

export function updateFlightMapData(map: MaplibreMap, data: FlightMapData | null): void {
  for (const key of TRACK_KEYS) {
    const source = map.getSource<GeoJSONSource>(TRACK_SOURCE_ID[key]);
    void source?.setData(toLineFeature(data?.[key] ?? []));
  }
  const lossSource = map.getSource<GeoJSONSource>(LOSS_SOURCE_ID);
  void lossSource?.setData(toLossFeatureCollection(data?.gpsLossRegions ?? []));
}

export function updateFlightMapVisibility(
  map: MaplibreMap,
  visibleTracks: Record<TrackKey, boolean>,
  showLoss: boolean,
): void {
  for (const key of TRACK_KEYS) {
    map.setLayoutProperty(TRACK_LAYER_ID[key], "visibility", visibleTracks[key] ? "visible" : "none");
  }
  map.setLayoutProperty(LOSS_LAYER_ID, "visibility", showLoss ? "visible" : "none");
}

/**
 * Bounding box for the initial camera fit. Deliberately framed around the trusted track
 * (GCS/fused, falling back to cleaned) rather than the raw GPS track - the raw track can
 * include a wild spoofed excursion hundreds of km away, and including it here would force
 * the camera to zoom out so far the actual flight loop shrinks to an invisible speck. The
 * raw track is still drawn and can be explored by panning/zooming out manually.
 */
export function computeBounds(data: FlightMapData): [[number, number], [number, number]] | null {
  const framingTrack = data.gcsTrack.length ? data.gcsTrack : data.cleanedTrack.length ? data.cleanedTrack : data.gpsTrack;

  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const p of framingTrack) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return framingTrack.length
    ? [
        [minLon, minLat],
        [maxLon, maxLat],
      ]
    : null;
}
