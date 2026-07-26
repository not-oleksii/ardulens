import { describe, expect, it } from "vitest";
import { gpsIntegrityAdvisor } from "../gps-integrity";
import type { Flight, Sample } from "../../../../types";

/** Builds a tight GPS cluster with a few far-away spikes injected at given indices. */
function buildTrackFlight(normalCount: number, spikeIndices: number[]): Flight {
  const samples: Sample[] = [];
  let t = 0;
  for (let i = 0; i < normalCount; i++) {
    samples.push(
      spikeIndices.includes(i)
        ? { t, lat: 60.0, lon: 40.0 } // ~1300km from the cluster -> rejected by MAX_FROM_CENTER
        : { t, lat: 50.0 + i * 0.00001, lon: 30.0 },
    );
    t += 1000;
  }
  return { board: "1", timeReliable: true, fmt: "skylog", samples };
}

describe("gpsIntegrityAdvisor", () => {
  it("reports nothing when no track points were rejected", () => {
    expect(gpsIntegrityAdvisor(buildTrackFlight(10, []))).toEqual([]);
  });

  it("warns when several points are rejected but they stay under 10% of the track", () => {
    const findings = gpsIntegrityAdvisor(buildTrackFlight(60, [10, 20, 30, 40, 50]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("warning");
  });

  it("escalates to critical once rejected points reach 10% of the track", () => {
    const findings = gpsIntegrityAdvisor(buildTrackFlight(20, [5, 10, 15]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("critical");
  });
});
