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

  it("shows only sensors that are actually present, healthy ones without an alert marker", () => {
    const present = MavSysStatusSensor.SENSOR_3D_GYRO | MavSysStatusSensor.SENSOR_GPS;
    render(<VehicleHealthSection sensorHealth={healthOf(present, present)} messages={[]} />);

    expect(screen.getByText("Гіроскоп")).toBeInTheDocument();
    expect(screen.getByText("GPS")).toBeInTheDocument();
    // Not present at all - shouldn't be listed regardless of its health bit.
    expect(screen.queryByText("Компас")).not.toBeInTheDocument();
  });

  it("shows the pre-arm badge as passing when PREARM_CHECK is present and healthy", () => {
    render(
      <VehicleHealthSection sensorHealth={healthOf(MavSysStatusSensor.PREARM_CHECK, MavSysStatusSensor.PREARM_CHECK)} messages={[]} />,
    );
    expect(screen.getByText("Перевірки перед зльотом пройдено")).toBeInTheDocument();
  });

  it("shows the pre-arm badge as failing when PREARM_CHECK is present but unhealthy", () => {
    render(<VehicleHealthSection sensorHealth={healthOf(MavSysStatusSensor.PREARM_CHECK, 0)} messages={[]} />);
    expect(screen.getByText("Перевірки перед зльотом не пройдено")).toBeInTheDocument();
  });

  it("hides the pre-arm badge entirely when PREARM_CHECK isn't reported as present", () => {
    render(<VehicleHealthSection sensorHealth={healthOf(MavSysStatusSensor.SENSOR_3D_GYRO, MavSysStatusSensor.SENSOR_3D_GYRO)} messages={[]} />);
    expect(screen.queryByText(/Перевірки перед зльотом/)).not.toBeInTheDocument();
  });

  it("renders STATUSTEXT messages in the order given (store already orders most-recent-first)", () => {
    const messages: StatusTextEntry[] = [
      { severity: MavSeverity.INFO, text: "Ready to fly", receivedAt: 2000 },
      { severity: MavSeverity.WARNING, text: "PreArm: Compass not calibrated", receivedAt: 1000 },
    ];
    render(<VehicleHealthSection sensorHealth={null} messages={messages} />);

    const rendered = screen.getAllByText(/Ready to fly|PreArm: Compass not calibrated/);
    expect(rendered.map((el) => el.textContent)).toEqual(["Ready to fly", "PreArm: Compass not calibrated"]);
  });
});
