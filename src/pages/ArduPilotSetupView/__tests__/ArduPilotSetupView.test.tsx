import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { useMavlinkConnectionStore } from "../../../stores/mavlinkConnectionStore/mavlinkConnectionStore";
import { ArduPilotSetupView } from "../ArduPilotSetupView";

const SAMPLE_PORTS = [
  { name: "COM3", description: "USB Serial" },
  { name: "COM4", description: null },
];

function mockBackend(invoked: (cmd: string, payload?: unknown) => void = () => {}) {
  mockIPC(
    (cmd, payload) => {
      invoked(cmd, payload);
      if (cmd === "list_serial_ports") return SAMPLE_PORTS;
      return undefined;
    },
    { shouldMockEvents: true },
  );
}

function getView() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <ArduPilotSetupView />
    </MemoryRouter>,
  );

  const getBackToHomeLink = () => screen.getByRole("link", { name: /На головну/ });
  const getSerialModeButton = () => screen.getByRole("button", { name: "USB / Серійний порт" });
  const getUdpModeButton = () => screen.getByRole("button", { name: "UDP (WiFi / SITL)" });
  const getUdpPortInput = () => screen.getByLabelText("Порт прослуховування");
  const getSerialPortSelect = () => screen.getByLabelText("Серійний порт");
  const getBaudRateSelect = () => screen.getByLabelText("Швидкість (baud rate)");
  const getRefreshPortsButton = () => screen.getByRole("button", { name: "Оновити порти" });
  const getConnectButton = () => screen.getByRole("button", { name: "Підключити" });
  const getDisconnectButton = () => screen.getByRole("button", { name: "Відключити" });
  const getStatusAlert = () => screen.getByRole("alert");

  const clickSerialMode = () => user.click(getSerialModeButton());
  const clickUdpMode = () => user.click(getUdpModeButton());
  const clickRefreshPorts = () => user.click(getRefreshPortsButton());
  const clickConnect = () => user.click(getConnectButton());
  const clickDisconnect = () => user.click(getDisconnectButton());

  return {
    user,
    getBackToHomeLink,
    getSerialModeButton,
    getUdpModeButton,
    getUdpPortInput,
    getSerialPortSelect,
    getBaudRateSelect,
    getRefreshPortsButton,
    getConnectButton,
    getDisconnectButton,
    getStatusAlert,
    clickSerialMode,
    clickUdpMode,
    clickRefreshPorts,
    clickConnect,
    clickDisconnect,
  };
}

beforeEach(() => {
  mockWindows("main");
});

afterEach(async () => {
  // Unmount first (synchronously runs each effect's cleanup, setting its `cancelled` flag),
  // then flush a macrotask so any still-pending onData()/onStatus() subscribe promises settle
  // and their now-guarded unlisten() calls fire while the mocked event plumbing is still
  // live - otherwise they fire later, after clearMocks() has torn it down, as an unhandled
  // rejection ("unregisterListener is not a function").
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  clearMocks();
  useMavlinkConnectionStore.getState().reset();
});

describe("ArduPilotSetupView", () => {
  it("renders the heading and description", () => {
    mockBackend();
    getView();
    expect(screen.getByRole("heading", { name: "Налаштування ArduPilot" })).toBeInTheDocument();
  });

  it("links back to Home", () => {
    mockBackend();
    const { getBackToHomeLink } = getView();
    expect(getBackToHomeLink()).toHaveAttribute("href", "/");
  });

  it("defaults to UDP mode with a listen-port input, starting at 14550", () => {
    mockBackend();
    const { getUdpPortInput } = getView();
    expect(getUdpPortInput()).toHaveValue(14550);
  });

  it("shows Not connected before any connection attempt", () => {
    mockBackend();
    const { getStatusAlert } = getView();
    expect(within(getStatusAlert()).getByText("Не підключено")).toBeInTheDocument();
  });

  it("switching to Serial mode fetches and lists ports, with a working refresh", async () => {
    const invoked = vi.fn();
    mockBackend(invoked);
    const { clickSerialMode, getSerialPortSelect, clickRefreshPorts } = getView();

    await clickSerialMode();

    const select = await screen.findByLabelText("Серійний порт");
    expect(within(select).getByRole("option", { name: "COM3 - USB Serial" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "COM4" })).toBeInTheDocument();
    expect(getSerialPortSelect()).toHaveValue("COM3");

    invoked.mockClear();
    await clickRefreshPorts();
    expect(invoked).toHaveBeenCalledWith("list_serial_ports", {});
  });

  it("connects over UDP with the configured port and reflects the Connected status once the backend confirms it", async () => {
    const invoked = vi.fn();
    mockBackend(invoked);
    const { clickConnect, getStatusAlert, getDisconnectButton } = getView();

    await clickConnect();

    expect(invoked).toHaveBeenCalledWith("connect_udp", { bindPort: 14550 });
    expect(within(getStatusAlert()).getByText("Підключення...")).toBeInTheDocument();

    await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });

    expect(await within(getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550")).toBeInTheDocument();
    expect(getDisconnectButton()).toBeInTheDocument();
  });

  it("connects over Serial with the selected port and baud rate", async () => {
    const invoked = vi.fn();
    mockBackend(invoked);
    const { clickSerialMode, clickConnect, getBaudRateSelect, user } = getView();
    await clickSerialMode();
    await screen.findByRole("option", { name: "COM3 - USB Serial" });
    await user.selectOptions(getBaudRateSelect(), "115200");

    await clickConnect();

    expect(invoked).toHaveBeenCalledWith("connect_serial", { portName: "COM3", baudRate: 115200 });
  });

  it("disconnects and returns to the idle status", async () => {
    mockBackend();
    const { clickConnect, clickDisconnect, getStatusAlert, getConnectButton } = getView();
    await clickConnect();
    await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
    await within(getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");

    await clickDisconnect();
    await emit("mavlink-transport://status", { kind: "disconnected" });

    expect(await within(getStatusAlert()).findByText("Не підключено")).toBeInTheDocument();
    expect(getConnectButton()).toBeInTheDocument();
  });

  it("shows a destructive alert with the error message when the backend reports a connection error", async () => {
    mockBackend();
    const { clickConnect, getStatusAlert } = getView();
    await clickConnect();

    await emit("mavlink-transport://status", { kind: "error", message: "port busy" });

    const alert = await within(getStatusAlert()).findByText("Помилка підключення: port busy");
    expect(alert).toBeInTheDocument();
  });

  it("surfaces a listSerialPorts failure (fetched on mount) as a visible error instead of silently showing an empty port list", async () => {
    mockIPC(
      (cmd) => {
        if (cmd === "list_serial_ports") throw new Error("Tauri APIs not available");
        return undefined;
      },
      { shouldMockEvents: true },
    );
    const { getStatusAlert } = getView();

    expect(await within(getStatusAlert()).findByText("Помилка підключення: Tauri APIs not available")).toBeInTheDocument();
  });

  it("accumulates received bytes as data events arrive", async () => {
    mockBackend();
    getView();

    await emit("mavlink-transport://data", { bytes: [1, 2, 3] });
    await emit("mavlink-transport://data", { bytes: [4, 5] });

    expect(await screen.findByText("Отримано: 5 Б")).toBeInTheDocument();
  });
});
