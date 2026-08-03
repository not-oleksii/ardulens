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
    // No POS data at all here, so there's no fused position to anchor either marker to -
    // falls back to each raw point's own altitude, but lat/lon stay null (untrustworthy).
    // endMs is the recovery point (t=3000, the next good sample), not the last rejected
    // sample itself (t=2000).
    expect(data?.gpsLossRegions).toEqual([
      { startMs: 2000, endMs: 3000, startLat: null, startLon: null, startAlt: 100, endLat: null, endLon: null, endAlt: 100 },
    ]);
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
    // "Lost" is anchored to the fused/GCS position when the spoof started (t=1000:
    // 50.001, 30.001), "reacquired" to the fused/GCS position at the next good raw-GPS
    // sample (t=2000: 50.002, 30.002) - not the spoofed raw-GPS position (-12, -77) either
    // time, and NOT the same point for both (a single rejected sample still recovers at a
    // distinct later point).
    expect(data?.gpsLossRegions).toEqual([
      {
        startMs: 1000,
        endMs: 2000,
        startLat: 50.001,
        startLon: 30.001,
        startAlt: null,
        endLat: 50.002,
        endLon: 30.002,
        endAlt: null,
      },
    ]);
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
    // endMs is the recovery point (t=4000, the next good sample after the 2-sample span),
    // not the last rejected sample (t=3000).
    expect(data?.gpsLossRegions).toEqual([
      { startMs: 2000, endMs: 4000, startLat: null, startLon: null, startAlt: null, endLat: null, endLon: null, endAlt: null },
    ]);
  });

  it("gives every isolated loss blip its own distinct recovery point, not just the last one", () => {
    // Two separate, non-consecutive spoofed blips (t=1000 and t=3000), each surrounded by
    // good points - regression test for pairing "lost -> recovered" per event, instead of
    // every blip anchoring to whatever the LAST region's recovery point happened to be.
    const gpsLat: RawLogPoint[] = [
      { t: 0, v: 50.0 },
      { t: 1000, v: 51.0 }, // spoofed blip #1
      { t: 2000, v: 50.001 },
      { t: 3000, v: 51.0 }, // spoofed blip #2
      { t: 4000, v: 50.002 },
    ];
    const gpsLng: RawLogPoint[] = [
      { t: 0, v: 30.0 },
      { t: 1000, v: 40.0 }, // spoofed blip #1
      { t: 2000, v: 30.001 },
      { t: 3000, v: 40.0 }, // spoofed blip #2
      { t: 4000, v: 30.002 },
    ];
    const data = buildFlightMapData(series(["GPS.Lat", gpsLat], ["GPS.Lng", gpsLng]));
    expect(data?.gpsLossRegions.map((r) => [r.startMs, r.endMs])).toEqual([
      [1000, 2000],
      [3000, 4000],
    ]);
  });

  it("anchors the start and end of a multi-sample loss region to different GCS positions", () => {
    // Same 3-good/2-spoofed shape as "groups consecutive rejected points" (keeps the
    // median center unambiguously anchored to the real cluster), plus POS data so the
    // loss (t=2000) and the recovery point (t=4000, the next good sample) resolve to
    // distinct fused positions.
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
    const posLat: RawLogPoint[] = [
      { t: 0, v: 50.0 },
      { t: 1000, v: 50.0002 },
      { t: 2000, v: 50.0004 },
      { t: 3000, v: 50.0006 },
      { t: 4000, v: 50.0008 },
    ];
    const posLng: RawLogPoint[] = [
      { t: 0, v: 30.0 },
      { t: 1000, v: 30.0002 },
      { t: 2000, v: 30.0004 },
      { t: 3000, v: 30.0006 },
      { t: 4000, v: 30.0008 },
    ];
    const data = buildFlightMapData(
      series(["POS.Lat", posLat], ["POS.Lng", posLng], ["GPS.Lat", gpsLat], ["GPS.Lng", gpsLng]),
    );
    // endMs/end* anchor to the recovery point (t=4000, the next good sample after the
    // 2-sample span), not the last rejected sample (t=3000).
    expect(data?.gpsLossRegions).toEqual([
      {
        startMs: 2000,
        endMs: 4000,
        startLat: 50.0004,
        startLon: 30.0004,
        startAlt: null,
        endLat: 50.0008,
        endLon: 30.0008,
        endAlt: null,
      },
    ]);
  });

  it("classifies correctly against the trusted GCS position even when a MAJORITY of raw GPS samples are spoofed", () => {
    // A median-of-the-raw-track center breaks here: 4 of 5 samples are wildly spoofed
    // (regression test found against a real ~25-minute flight where a majority of raw GPS
    // samples were spoofed - the old median approach rejected the ENTIRE flight, including
    // every genuinely good point, as "too far from center"). Anchoring against the trusted
    // GCS/POS position instead isn't skewed by how much of the raw GPS stream is bad.
    const posLat = [0, 1000, 2000, 3000, 4000].map((t) => ({ t, v: 50.0 }));
    const posLng = [0, 1000, 2000, 3000, 4000].map((t) => ({ t, v: 30.0 }));
    const gpsLat: RawLogPoint[] = [
      { t: 0, v: 50.0 }, // the only genuinely good sample
      { t: 1000, v: 10.0 }, // spoofed
      { t: 2000, v: -10.0 }, // spoofed
      { t: 3000, v: 60.0 }, // spoofed
      { t: 4000, v: -60.0 }, // spoofed
    ];
    const gpsLng: RawLogPoint[] = [
      { t: 0, v: 30.0 },
      { t: 1000, v: 100.0 },
      { t: 2000, v: -100.0 },
      { t: 3000, v: 150.0 },
      { t: 4000, v: -150.0 },
    ];
    const data = buildFlightMapData(
      series(["POS.Lat", posLat], ["POS.Lng", posLng], ["GPS.Lat", gpsLat], ["GPS.Lng", gpsLng]),
    );
    expect(data?.cleanedTrack.map((p) => p.t)).toEqual([0]);
    // No recovery point - the spoofed span runs to the end of the track (GPS never
    // recovers before the log ends), so there's nothing to anchor a "reacquired" marker to.
    expect(data?.gpsLossRegions).toEqual([
      { startMs: 1000, endMs: 4000, startLat: 50.0, startLon: 30.0, startAlt: null, endLat: null, endLon: null, endAlt: null },
    ]);
  });

  it("rejects a sample where GPS.Status reports no fix, even though the position itself looks plausible", () => {
    // A pure position-based check can't catch this: t=1000's lat/lon is a perfectly
    // ordinary continuation of the track, not a jump or far-from-center outlier - only the
    // receiver's own Status field (0 = NO_GPS) reveals it lost its fix, possibly just
    // holding a stale-but-plausible position rather than an obvious teleport.
    const gpsLat: RawLogPoint[] = [
      { t: 0, v: 50.0 },
      { t: 1000, v: 50.0005 },
      { t: 2000, v: 50.001 },
    ];
    const gpsLng: RawLogPoint[] = [
      { t: 0, v: 30.0 },
      { t: 1000, v: 30.0005 },
      { t: 2000, v: 30.001 },
    ];
    const gpsStatus: RawLogPoint[] = [
      { t: 0, v: 3 }, // 3D fix
      { t: 1000, v: 0 }, // NO_GPS - no fix at all
      { t: 2000, v: 3 }, // 3D fix
    ];
    const data = buildFlightMapData(
      series(["GPS.Lat", gpsLat], ["GPS.Lng", gpsLng], ["GPS.Status", gpsStatus]),
    );
    expect(data?.cleanedTrack.map((p) => p.t)).toEqual([0, 2000]);
    expect(data?.gpsLossRegions.map((r) => [r.startMs, r.endMs])).toEqual([[1000, 2000]]);
  });
});
