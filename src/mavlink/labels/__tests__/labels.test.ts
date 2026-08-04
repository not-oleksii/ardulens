import { describe, expect, it, vi } from "vitest";
import { mavAutopilotLabel, mavStateLabel, mavTypeLabel } from "../labels";
import { MavAutopilot, MavState, MavType } from "../../registry/registry";

function fakeT() {
  return vi.fn((key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
  );
}

describe("mavTypeLabel", () => {
  it("resolves a known type to its i18n key", () => {
    const t = fakeT();
    expect(mavTypeLabel(t, MavType.QUADROTOR)).toBe("ardupilotSetup.vehicle.types.quadrotor");
  });

  it("falls back to the unknown key with the raw value for an unmapped type", () => {
    const t = fakeT();
    expect(mavTypeLabel(t, 9999 as MavType)).toBe('ardupilotSetup.vehicle.types.unknown:{"value":9999}');
  });
});

describe("mavAutopilotLabel", () => {
  it("resolves ArduPilotMega", () => {
    const t = fakeT();
    expect(mavAutopilotLabel(t, MavAutopilot.ARDUPILOTMEGA)).toBe("ardupilotSetup.vehicle.autopilots.ardupilotmega");
  });

  it("falls back to unknown for an unmapped autopilot", () => {
    const t = fakeT();
    expect(mavAutopilotLabel(t, 9999 as MavAutopilot)).toBe('ardupilotSetup.vehicle.autopilots.unknown:{"value":9999}');
  });
});

describe("mavStateLabel", () => {
  it("resolves every named MavState value", () => {
    const t = fakeT();
    expect(mavStateLabel(t, MavState.ACTIVE)).toBe("ardupilotSetup.vehicle.states.active");
    expect(mavStateLabel(t, MavState.CRITICAL)).toBe("ardupilotSetup.vehicle.states.critical");
  });

  it("falls back to unknown for an unmapped state", () => {
    const t = fakeT();
    expect(mavStateLabel(t, 9999 as MavState)).toBe('ardupilotSetup.vehicle.states.unknown:{"value":9999}');
  });
});
