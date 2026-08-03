export interface TrackPoint {
  t: number;
  lat: number;
  lon: number;
  alt: number | null;
}

export interface GpsLossRegion {
  /** When GPS was first lost. */
  startMs: number;
  /** When GPS was reacquired (the first trustworthy sample after the loss) - equal to the
   * last rejected sample's own timestamp only if the track ends while still untrustworthy
   * (no recovery before the log ends; see end* below). */
  endMs: number;
  /** Fused/GCS position and altitude when GPS was first lost - the raw GPS position itself
   * is the spoofed/meaningless one, so it isn't useful for placing a marker on the map. */
  startLat: number | null;
  startLon: number | null;
  startAlt: number | null;
  /** Fused/GCS position and altitude when GPS was reacquired. Null when the track ends
   * while still untrustworthy - i.e. there's no recovery point to mark. */
  endLat: number | null;
  endLon: number | null;
  endAlt: number | null;
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
