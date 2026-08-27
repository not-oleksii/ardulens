import { describe, expect, it } from "vitest";
import { haversine } from "../../../utils/geo/geo";
import { lobeOutline } from "../lobeGeometry";

const BASE = { lat: 50, lon: 30 };

describe("lobeOutline", () => {
  it("omni: every ring point sits ~rangeM from the device, forming a closed loop", () => {
    const ring = lobeOutline({ ...BASE, pattern: "omni", rangeM: 1000, bearingDeg: 0, beamwidthDeg: 360 });
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [lon, lat] of ring) {
      expect(haversine(BASE.lat, BASE.lon, lat!, lon!)).toBeCloseTo(1000, -1);
    }
  });

  it("dipole: pinches to ~0 range 90 degrees off the bearing axis, full range on-axis", () => {
    const ring = lobeOutline({ ...BASE, pattern: "dipole", rangeM: 1000, bearingDeg: 0, beamwidthDeg: 360 });
    // bearing 0 (north) and 180 (south) are the lobe tips - full range.
    const north = ring.find((_, i) => Math.abs((i * 360) / (ring.length - 1) - 0) < 1)!;
    expect(haversine(BASE.lat, BASE.lon, north[1]!, north[0]!)).toBeCloseTo(1000, -1);
    // 90 degrees off the bearing axis is the pinch point - ~0 range, i.e. back at the device.
    const east = ring.find((_, i) => Math.abs((i * 360) / (ring.length - 1) - 90) < 1)!;
    expect(haversine(BASE.lat, BASE.lon, east[1]!, east[0]!)).toBeLessThan(10);
  });

  it("directional: stays within the sector's angular span and closes back through the device", () => {
    const ring = lobeOutline({ ...BASE, pattern: "directional", rangeM: 1000, bearingDeg: 90, beamwidthDeg: 30 });
    expect(ring[0]).toEqual([BASE.lon, BASE.lat]);
    expect(ring[ring.length - 1]).toEqual([BASE.lon, BASE.lat]);
    // Every non-apex point should be ~1000m out (on the sector's arc), not at the device.
    const arcPoints = ring.slice(1, -1);
    expect(arcPoints.length).toBeGreaterThan(0);
    for (const [lon, lat] of arcPoints) {
      expect(haversine(BASE.lat, BASE.lon, lat!, lon!)).toBeCloseTo(1000, -1);
    }
  });
});
