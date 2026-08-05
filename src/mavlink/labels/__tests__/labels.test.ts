import { describe, expect, it, vi } from "vitest";
import { magCalStatusLabel, mavAutopilotLabel, mavResultLabel, mavStateLabel, mavTypeLabel } from "../labels";
import { MagCalStatus, MavAutopilot, MavResult, MavState, MavType } from "../../registry/registry";

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

describe("magCalStatusLabel", () => {
  it("resolves every named MagCalStatus value", () => {
    const t = fakeT();
    expect(magCalStatusLabel(t, MagCalStatus.RUNNING_STEP_ONE)).toBe("ardupilotSetup.compassCal.status.runningStepOne");
    expect(magCalStatusLabel(t, MagCalStatus.SUCCESS)).toBe("ardupilotSetup.compassCal.status.success");
    expect(magCalStatusLabel(t, MagCalStatus.BAD_ORIENTATION)).toBe("ardupilotSetup.compassCal.status.badOrientation");
  });

  it("falls back to unknown for an unmapped status", () => {
    const t = fakeT();
    expect(magCalStatusLabel(t, 9999 as MagCalStatus)).toBe('ardupilotSetup.compassCal.status.unknown:{"value":9999}');
  });
});

describe("mavResultLabel", () => {
  it("resolves a known result to its i18n key", () => {
    const t = fakeT();
    expect(mavResultLabel(t, MavResult.DENIED)).toBe("ardupilotSetup.compassCal.result.denied");
  });

  it("falls back to unknown for an unmapped result", () => {
    const t = fakeT();
    expect(mavResultLabel(t, 9999 as MavResult)).toBe('ardupilotSetup.compassCal.result.unknown:{"value":9999}');
  });
});
