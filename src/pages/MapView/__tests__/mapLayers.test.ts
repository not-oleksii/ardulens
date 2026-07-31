import { describe, expect, it } from "vitest";
import type { FlightMapData, TrackPoint } from "../../../analysis/flight-map/types";
import { computeBounds } from "../mapLayers";

function point(t: number, lat: number, lon: number): TrackPoint {
  return { t, lat, lon, alt: null };
}

function flightMapData(overrides: Partial<FlightMapData>): FlightMapData {
  return { gcsTrack: [], gpsTrack: [], cleanedTrack: [], gpsLossRegions: [], ...overrides };
}

describe("computeBounds", () => {
  it("returns null when there are no points anywhere", () => {
    expect(computeBounds(flightMapData({}))).toBeNull();
  });

  it("frames around the small real flight loop, ignoring a wild raw-GPS excursion", () => {
    // The real (GCS) track stays within ~0.01 degrees of base; the raw GPS track also
    // includes a spoofed excursion ~5 degrees away. The camera should fit the real loop,
    // not be dragged out to include the excursion - otherwise the actual flight shrinks
    // to an invisible speck (the bug this test guards against).
    const gcsTrack = [point(0, 50.0, 30.0), point(1000, 50.01, 30.015), point(2000, 50.0, 30.0)];
    const gpsTrack = [...gcsTrack, point(1500, 55.0, 35.0)]; // spoofed excursion

    const bounds = computeBounds(flightMapData({ gcsTrack, gpsTrack }));

    expect(bounds).not.toBeNull();
    const [[minLon, minLat], [maxLon, maxLat]] = bounds!;
    expect(maxLat - minLat).toBeLessThan(1);
    expect(maxLon - minLon).toBeLessThan(1);
  });

  it("falls back to the cleaned track when there's no GCS/fused position at all", () => {
    const cleanedTrack = [point(0, 10, 20), point(1000, 10.001, 20.001)];
    const bounds = computeBounds(flightMapData({ cleanedTrack }));
    expect(bounds).toEqual([
      [20, 10],
      [20.001, 10.001],
    ]);
  });

  it("falls back to the raw GPS track when neither GCS nor cleaned data exists", () => {
    const gpsTrack = [point(0, 1, 2), point(1000, 1.5, 2.5)];
    const bounds = computeBounds(flightMapData({ gpsTrack }));
    expect(bounds).toEqual([
      [2, 1],
      [2.5, 1.5],
    ]);
  });
});
