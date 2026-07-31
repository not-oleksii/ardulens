import { describe, expect, it } from "vitest";
import type { RawLogPoint } from "../../raw-log/types";
import { buildFlightMapData } from "../flight-map";

function series(...entries: Array<[string, RawLogPoint[]]>): Record<string, RawLogPoint[]> {
  return Object.fromEntries(entries);
}

describe("buildFlightMapData", () => {
  it("returns null when there is no POS or GPS data", () => {
    expect(buildFlightMapData(series())).toBeNull();
  });

  it("builds the GCS (fused) track from POS.Lat/Lng/RelHomeAlt", () => {
    const data = buildFlightMapData(
      series(
        ["POS.Lat", [{ t: 0, v: 50.0 }, { t: 1000, v: 50.001 }]],
        ["POS.Lng", [{ t: 0, v: 30.0 }, { t: 1000, v: 30.001 }]],
        ["POS.RelHomeAlt", [{ t: 0, v: 10 }, { t: 1000, v: 20 }]],
      ),
    );
    expect(data?.gcsTrack).toEqual([
      { t: 0, lat: 50.0, lon: 30.0, alt: 10 },
      { t: 1000, lat: 50.001, lon: 30.001, alt: 20 },
    ]);
  });

  it("falls back to POS.Alt when POS.RelHomeAlt is absent", () => {
    const data = buildFlightMapData(
      series(["POS.Lat", [{ t: 0, v: 50 }]], ["POS.Lng", [{ t: 0, v: 30 }]], ["POS.Alt", [{ t: 0, v: 123 }]]),
    );
    expect(data?.gcsTrack).toEqual([{ t: 0, lat: 50, lon: 30, alt: 123 }]);
  });

  it("filters out near-zero (invalid) lat/lon points", () => {
    const data = buildFlightMapData(
      series(
        ["GPS.Lat", [{ t: 0, v: 0 }, { t: 1000, v: 50 }]],
        ["GPS.Lng", [{ t: 0, v: 0 }, { t: 1000, v: 30 }]],
      ),
    );
    expect(data?.gpsTrack).toEqual([{ t: 1000, lat: 50, lon: 30, alt: null }]);
  });

  it("drops a raw-GPS teleport point from cleanedTrack and reports it as a loss region", () => {
    const gpsLat: RawLogPoint[] = [
      { t: 0, v: 50.0 },
      { t: 1000, v: 50.001 },
      { t: 2000, v: 51.0 }, // spoofed teleport
      { t: 3000, v: 50.002 },
    ];
    const gpsLng: RawLogPoint[] = [
      { t: 0, v: 30.0 },
      { t: 1000, v: 30.001 },
      { t: 2000, v: 40.0 }, // spoofed teleport
      { t: 3000, v: 30.002 },
    ];
    const gpsAlt: RawLogPoint[] = [
      { t: 0, v: 100 },
      { t: 1000, v: 100 },
      { t: 2000, v: 100 },
      { t: 3000, v: 100 },
    ];
    const data = buildFlightMapData(series(["GPS.Lat", gpsLat], ["GPS.Lng", gpsLng], ["GPS.Alt", gpsAlt]));

    expect(data?.cleanedTrack.map((p) => p.t)).toEqual([0, 1000, 3000]);
    // No POS data at all here, so there's no fused position to anchor the marker to -
    // falls back to the raw point's own altitude, but lat/lon stay null (untrustworthy).
    expect(data?.gpsLossRegions).toEqual([{ startMs: 2000, endMs: 2000, lat: null, lon: null, alt: 100 }]);
  });

  it("keeps the GCS/fused track intact even when raw GPS is spoofed", () => {
    const data = buildFlightMapData(
      series(
        ["POS.Lat", [{ t: 0, v: 50.0 }, { t: 1000, v: 50.001 }, { t: 2000, v: 50.002 }]],
        ["POS.Lng", [{ t: 0, v: 30.0 }, { t: 1000, v: 30.001 }, { t: 2000, v: 30.002 }]],
        ["GPS.Lat", [{ t: 0, v: 50.0 }, { t: 1000, v: -12.0 }, { t: 2000, v: 50.002 }]],
        ["GPS.Lng", [{ t: 0, v: 30.0 }, { t: 1000, v: -77.0 }, { t: 2000, v: 30.002 }]],
      ),
    );
    expect(data?.gcsTrack).toHaveLength(3);
    expect(data?.cleanedTrack.map((p) => p.t)).toEqual([0, 2000]);
    // The marker is anchored to the fused/GCS position at that time (50.001, 30.001),
    // not the spoofed raw-GPS position (-12, -77).
    expect(data?.gpsLossRegions).toEqual([{ startMs: 1000, endMs: 1000, lat: 50.001, lon: 30.001, alt: null }]);
  });

  it("groups consecutive rejected points into a single region", () => {
    // A majority of "real" points (near a common center) plus two consecutive far/spoofed
    // ones - keeps the median center unambiguously anchored to the real cluster.
    const gpsLat: RawLogPoint[] = [
      { t: 0, v: 50.0 },
      { t: 1000, v: 50.0005 },
      { t: 2000, v: 51.0 }, // spoofed
      { t: 3000, v: 51.1 }, // spoofed
      { t: 4000, v: 50.001 },
    ];
    const gpsLng: RawLogPoint[] = [
      { t: 0, v: 30.0 },
      { t: 1000, v: 30.0005 },
      { t: 2000, v: 40.0 }, // spoofed
      { t: 3000, v: 40.1 }, // spoofed
      { t: 4000, v: 30.001 },
    ];
    const data = buildFlightMapData(series(["GPS.Lat", gpsLat], ["GPS.Lng", gpsLng]));
    expect(data?.gpsLossRegions).toEqual([{ startMs: 2000, endMs: 3000, lat: null, lon: null, alt: null }]);
  });
});
