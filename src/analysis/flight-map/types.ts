export interface TrackPoint {
  t: number;
  lat: number;
  lon: number;
  alt: number | null;
}

export interface GpsLossRegion {
  startMs: number;
  endMs: number;
  /** Fused/GCS position and altitude during the loss - the raw GPS position itself is
   * the spoofed/meaningless one, so it isn't useful for placing a marker on the map. */
  lat: number | null;
  lon: number | null;
  alt: number | null;
}

export interface FlightMapData {
  /** Fused/EKF position (POS) - what the GCS displayed, resistant to GPS spoofing. */
  gcsTrack: TrackPoint[];
  /** Raw GPS position (GPS), unfiltered - includes any spoofed/teleported points. */
  gpsTrack: TrackPoint[];
  /** Raw GPS track after teleport/spoofing rejection. */
  cleanedTrack: TrackPoint[];
  /** Time ranges where raw GPS points were rejected as teleport/spoofing. */
  gpsLossRegions: GpsLossRegion[];
}

export interface FlightMapError {
  error: string;
}

export interface FlightMapInfo {
  info: string;
}

/** null means: a valid .bin, but no POS/GPS position data in it. */
export type FlightMapResult = FlightMapData | FlightMapError | FlightMapInfo | null;

export function isFlightMapError(r: FlightMapResult): r is FlightMapError {
  return r !== null && "error" in r;
}

export function isFlightMapInfo(r: FlightMapResult): r is FlightMapInfo {
  return r !== null && "info" in r;
}

export function isFlightMapData(r: FlightMapResult): r is FlightMapData {
  return r !== null && "gcsTrack" in r;
}
