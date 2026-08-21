import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MavSysStatusSensor } from "../../../mavlink/registry/registry";
import type { SensorHealthTelemetry } from "../../../stores/mavlinkTelemetryStore/types";
import { PreflightChecklistSection } from "../PreflightChecklistSection";

function healthOf(present: number, health: number): SensorHealthTelemetry {
  return { present, enabled: present, health, updatedAt: 1000 };
}

describe("PreflightChecklistSection", () => {
  it("shows a waiting message before any SYS_STATUS has arrived", () => {
    render(<PreflightChecklistSection sensorHealth={null} />);
    expect(screen.getByText("Очікування телеметрії...")).toBeInTheDocument();
  });

  it("shows both a healthy and an unhealthy present sensor, unlike the PFD overlay's failures-only badge", () => {
    const present = MavSysStatusSensor.SENSOR_3D_GYRO | MavSysStatusSensor.SENSOR_GPS;
    const healthy = MavSysStatusSensor.SENSOR_GPS; // GYRO present but not in the healthy mask
    render(<PreflightChecklistSection sensorHealth={healthOf(present, healthy)} />);

    expect(screen.getByText("Гіроскоп")).toBeInTheDocument();
    expect(screen.getByText("GPS")).toBeInTheDocument();
  });

  it("never lists a sensor that isn't present at all, regardless of its health bit", () => {
    // MAG isn't present, and its health bit happens to also read 0 (unhealthy-looking) - must
    // still be excluded since the vehicle doesn't even report having this sensor.
    render(<PreflightChecklistSection sensorHealth={healthOf(MavSysStatusSensor.SENSOR_3D_GYRO, MavSysStatusSensor.SENSOR_3D_GYRO)} />);
    expect(screen.queryByText("Компас")).not.toBeInTheDocument();
  });

  it("shows a waiting message when SYS_STATUS reports no sensors present at all", () => {
    render(<PreflightChecklistSection sensorHealth={healthOf(0, 0)} />);
    expect(screen.getByText("Очікування телеметрії...")).toBeInTheDocument();
  });
});
