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
