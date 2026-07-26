import { describe, expect, it } from "vitest";
import { landingVoltageAdvisor, voltageSagAdvisor } from "../voltage-sag";
import type { Flight, Sample } from "../../../../types";

function sagFlight(sagVoltage: number): Flight {
  const samples: Sample[] = [
    { t: 0, voltage: 25.0, airspeed: 0, throttle: 50 },
    { t: 1000, voltage: sagVoltage, airspeed: 12, throttle: 100 },
  ];
  return { board: "1", timeReliable: true, fmt: "skylog", samples };
}

describe("voltageSagAdvisor", () => {
  it("reports critical when the sag drop is >=15% of takeoff voltage", () => {
    const findings = voltageSagAdvisor(sagFlight(21.0)); // 16% drop
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("critical");
  });

  it("reports a warning for an 8-15% drop", () => {
    const findings = voltageSagAdvisor(sagFlight(22.5)); // 10% drop
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("warning");
  });

  it("reports nothing for a normal drop under 8%", () => {
    expect(voltageSagAdvisor(sagFlight(23.75))).toEqual([]); // 5% drop
  });

  it("reports nothing when throttle never hit 100% while airborne", () => {
    const flight = sagFlight(0);
    flight.samples[1]!.throttle = 50;
    expect(voltageSagAdvisor(flight)).toEqual([]);
  });
});

function landingFlight(landingVoltage: number): Flight {
  const samples: Sample[] = [
    { t: 0, voltage: 25.0 },
    { t: 20_000, voltage: landingVoltage },
  ];
  return { board: "1", timeReliable: true, fmt: "skylog", samples };
}

describe("landingVoltageAdvisor", () => {
  it("warns when landing voltage drops 20% or more from takeoff", () => {
    const findings = landingVoltageAdvisor(landingFlight(19.0)); // 24% drop
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("warning");
  });

  it("reports nothing for a normal landing voltage", () => {
    expect(landingVoltageAdvisor(landingFlight(21.0))).toEqual([]); // 16% drop
  });
});
