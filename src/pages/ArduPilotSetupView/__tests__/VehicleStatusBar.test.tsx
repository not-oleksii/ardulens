import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MavAutopilot, MavResult, MavState, MavType } from "../../../mavlink/registry/registry";
import type { VehicleInfo } from "../../../stores/mavlinkVehicleStore/types";
import { VehicleStatusBar } from "../VehicleStatusBar";

function sampleVehicle(overrides: Partial<VehicleInfo> = {}): VehicleInfo {
  return {
    sysid: 1,
    compid: 1,
    type: MavType.QUADROTOR,
    autopilot: MavAutopilot.ARDUPILOTMEGA,
    armed: false,
    systemStatus: MavState.STANDBY,
    customMode: 0, // STABILIZE
    lastHeartbeatAt: 1000,
    ...overrides,
  };
}

function getView(overrides: Partial<VehicleInfo> = {}) {
  const user = userEvent.setup();
  const onArm = vi.fn();
  const onDisarm = vi.fn();
  const onSetMode = vi.fn();
  render(
    <VehicleStatusBar
      vehicle={sampleVehicle(overrides)}
      battery={null}
      gps={null}
      armCommandAck={null}
      onArm={onArm}
      onDisarm={onDisarm}
      onSetMode={onSetMode}
    />,
  );
  return { user, onArm, onDisarm, onSetMode };
}

describe("VehicleStatusBar", () => {
  it("renders nothing when no vehicle is known", () => {
    const { container } = render(
      <VehicleStatusBar vehicle={null} battery={null} gps={null} armCommandAck={null} onArm={vi.fn()} onDisarm={vi.fn()} onSetMode={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("clicking the disarmed badge opens a confirmation before arming, and confirming calls onArm", async () => {
    const { user, onArm } = getView({ armed: false });

    await user.click(screen.getByRole("button", { name: "Озброїти" }));
    expect(onArm).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Озброїти апарат?")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Озброїти" }));

    expect(onArm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancelling the confirmation dialog never calls onArm", async () => {
    const { user, onArm } = getView({ armed: false });

    await user.click(screen.getByRole("button", { name: "Озброїти" }));
    await user.click(screen.getByRole("button", { name: "Скасувати" }));

    expect(onArm).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("disarming needs no confirmation - clicking the armed badge calls onDisarm immediately", async () => {
    const { user, onDisarm } = getView({ armed: true });

    await user.click(screen.getByRole("button", { name: "Роззброїти" }));

    expect(onDisarm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a mode dropdown for Copter and calls onSetMode when a different mode is picked", async () => {
    const { user, onSetMode } = getView({ type: MavType.QUADROTOR, customMode: 0 });

    const select = screen.getByLabelText("Режим");
    expect(select).toBeInTheDocument();
    await user.selectOptions(select, "6"); // RTL

    expect(onSetMode).toHaveBeenCalledWith(6);
  });

  it("falls back to a read-only mode label for a vehicle family with no known mode table", () => {
    getView({ type: MavType.GROUND_ROVER, customMode: 0 });
    expect(screen.queryByLabelText("Режим")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows a rejection message when the last arm command wasn't accepted", () => {
    render(
      <VehicleStatusBar
        vehicle={sampleVehicle()}
        battery={null}
        gps={null}
        armCommandAck={{ result: MavResult.DENIED }}
        onArm={vi.fn()}
        onDisarm={vi.fn()}
        onSetMode={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Команду озброєння/роззброєння відхилено: Відхилено");
  });

  it("shows nothing extra when the last arm command was accepted", () => {
    render(
      <VehicleStatusBar
        vehicle={sampleVehicle()}
        battery={null}
        gps={null}
        armCommandAck={{ result: MavResult.ACCEPTED }}
        onArm={vi.fn()}
        onDisarm={vi.fn()}
        onSetMode={vi.fn()}
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
