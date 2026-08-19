import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MavSeverity, MavSysStatusSensor } from "../../../mavlink/registry/registry";
import type { StatusTextEntry } from "../../../stores/mavlinkStatusTextStore/types";
import type { SensorHealthTelemetry } from "../../../stores/mavlinkTelemetryStore/types";
import { VehicleHealthSection } from "../VehicleHealthSection";

function healthOf(present: number, health: number): SensorHealthTelemetry {
  return { present, enabled: present, health, updatedAt: 1000 };
}

describe("VehicleHealthSection", () => {
  it("renders nothing before any SYS_STATUS or STATUSTEXT has arrived", () => {
    const { container } = render(<VehicleHealthSection sensorHealth={null} messages={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when every present sensor is healthy and PREARM_CHECK passes - failures-only by design", () => {
    const present =
      MavSysStatusSensor.SENSOR_3D_GYRO | MavSysStatusSensor.SENSOR_GPS | MavSysStatusSensor.PREARM_CHECK;
    const { container } = render(<VehicleHealthSection sensorHealth={healthOf(present, present)} messages={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows only the unhealthy present sensor, not the healthy ones", () => {
    const present = MavSysStatusSensor.SENSOR_3D_GYRO | MavSysStatusSensor.SENSOR_GPS;
    const healthy = MavSysStatusSensor.SENSOR_GPS; // GYRO present but not in the healthy mask
    render(<VehicleHealthSection sensorHealth={healthOf(present, healthy)} messages={[]} />);

    expect(screen.getByText("Гіроскоп")).toBeInTheDocument();
    expect(screen.queryByText("GPS")).not.toBeInTheDocument();
  });

  it("never lists a sensor that isn't present at all, regardless of its health bit", () => {
    // MAG isn't present, and its health bit happens to also read 0 (unhealthy-looking) - must
    // still be excluded since the vehicle doesn't even report having this sensor.
    render(<VehicleHealthSection sensorHealth={healthOf(MavSysStatusSensor.SENSOR_3D_GYRO, MavSysStatusSensor.SENSOR_3D_GYRO)} messages={[]} />);
    expect(screen.queryByText("Компас")).not.toBeInTheDocument();
  });

  it("shows the pre-arm-failing badge when PREARM_CHECK is present but unhealthy", () => {
    render(<VehicleHealthSection sensorHealth={healthOf(MavSysStatusSensor.PREARM_CHECK, 0)} messages={[]} />);
    expect(screen.getByText("Перевірки перед зльотом не пройдено")).toBeInTheDocument();
  });

  it("shows nothing pre-arm-related when PREARM_CHECK is present and healthy", () => {
    render(
      <VehicleHealthSection sensorHealth={healthOf(MavSysStatusSensor.PREARM_CHECK, MavSysStatusSensor.PREARM_CHECK)} messages={[]} />,
    );
    expect(screen.queryByText(/Перевірки перед зльотом/)).not.toBeInTheDocument();
  });

  it("hides the pre-arm badge entirely when PREARM_CHECK isn't reported as present", () => {
    render(<VehicleHealthSection sensorHealth={healthOf(MavSysStatusSensor.SENSOR_3D_GYRO, 0)} messages={[]} />);
    expect(screen.queryByText(/Перевірки перед зльотом/)).not.toBeInTheDocument();
  });

  it("shows STATUSTEXT messages at WARNING or worse, most-recent-first order preserved from the store", () => {
    const messages: StatusTextEntry[] = [
      { severity: MavSeverity.ERROR, text: "PreArm: GPS glitch", receivedAt: 2000 },
      { severity: MavSeverity.WARNING, text: "PreArm: Compass not calibrated", receivedAt: 1000 },
    ];
    render(<VehicleHealthSection sensorHealth={null} messages={messages} />);

    const rendered = screen.getAllByText(/PreArm: GPS glitch|PreArm: Compass not calibrated/);
    expect(rendered.map((el) => el.textContent)).toEqual(["PreArm: GPS glitch", "PreArm: Compass not calibrated"]);
  });

  it("hides a routine INFO/DEBUG STATUSTEXT message - this view is failures-only", () => {
    const messages: StatusTextEntry[] = [{ severity: MavSeverity.INFO, text: "Ready to fly", receivedAt: 1000 }];
    const { container } = render(<VehicleHealthSection sensorHealth={null} messages={messages} />);
    expect(container).toBeEmptyDOMElement();
  });
});
