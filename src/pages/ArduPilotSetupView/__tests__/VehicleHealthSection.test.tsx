import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MavSysStatusSensor } from "../../../mavlink/registry/registry";
import type { SensorHealthTelemetry } from "../../../stores/mavlinkTelemetryStore/types";
import { VehicleHealthSection } from "../VehicleHealthSection";

function healthOf(present: number, health: number): SensorHealthTelemetry {
  return { present, enabled: present, health, updatedAt: 1000 };
}

describe("VehicleHealthSection", () => {
  it("renders nothing before any SYS_STATUS has arrived", () => {
    const { container } = render(<VehicleHealthSection sensorHealth={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when PREARM_CHECK passes, regardless of other unhealthy sensors - just the headline signal", () => {
    const present = MavSysStatusSensor.SENSOR_3D_GYRO | MavSysStatusSensor.PREARM_CHECK;
    const health = MavSysStatusSensor.PREARM_CHECK; // GYRO unhealthy, but PREARM_CHECK itself passes
    const { container } = render(<VehicleHealthSection sensorHealth={healthOf(present, health)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the pre-arm-failing badge when PREARM_CHECK is present but unhealthy", () => {
    render(<VehicleHealthSection sensorHealth={healthOf(MavSysStatusSensor.PREARM_CHECK, 0)} />);
    expect(screen.getByText("Перевірки перед зльотом не пройдено")).toBeInTheDocument();
  });

  it("shows nothing pre-arm-related when PREARM_CHECK is present and healthy", () => {
    render(<VehicleHealthSection sensorHealth={healthOf(MavSysStatusSensor.PREARM_CHECK, MavSysStatusSensor.PREARM_CHECK)} />);
    expect(screen.queryByText(/Перевірки перед зльотом/)).not.toBeInTheDocument();
  });

  it("hides the pre-arm badge entirely when PREARM_CHECK isn't reported as present", () => {
    render(<VehicleHealthSection sensorHealth={healthOf(MavSysStatusSensor.SENSOR_3D_GYRO, 0)} />);
    expect(screen.queryByText(/Перевірки перед зльотом/)).not.toBeInTheDocument();
  });
});
