import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { encodePacket } from "../../../mavlink/codec/codec";
import { x25Crc } from "../../../mavlink/crc/crc";
import { paramValueToWireBits } from "../../../mavlink/paramValueCodec/paramValueCodec";
import {
  Attitude,
  GlobalPositionInt,
  GpsFixType,
  GpsRawInt,
  Heartbeat,
  MavAutopilot,
  MavModeFlag,
  MavParamType,
  MavState,
  MavType,
  ParamRequestList,
  ParamRequestRead,
  ParamSet,
  ParamValue,
  RequestDataStream,
  SysStatus,
  VfrHud,
} from "../../../mavlink/registry/registry";
import { useMavlinkConnectionStore } from "../../../stores/mavlinkConnectionStore/mavlinkConnectionStore";
import { useMavlinkParameterStore } from "../../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { useMavlinkTelemetryStore } from "../../../stores/mavlinkTelemetryStore/mavlinkTelemetryStore";
import { useMavlinkVehicleStore } from "../../../stores/mavlinkVehicleStore/mavlinkVehicleStore";
import { ArduPilotSetupView } from "../ArduPilotSetupView";

const SAMPLE_PORTS = [
  { name: "COM3", description: "USB Serial" },
  { name: "COM4", description: null },
];

function sampleHeartbeatBytes(): number[] {
  const hb = new Heartbeat();
  hb.type = MavType.QUADROTOR;
  hb.autopilot = MavAutopilot.ARDUPILOTMEGA;
  hb.baseMode = MavModeFlag.STABILIZE_ENABLED;
  hb.customMode = 0;
  hb.systemStatus = MavState.STANDBY;
  hb.mavlinkVersion = 3;
  return Array.from(encodePacket(hb, { seq: 1, sysid: 1, compid: 1 }));
}

/** Builds real PARAM_VALUE wire bytes (as a vehicle would send them), including a correct CRC. */
function buildParamValueBytes(
  name: string,
  value: number,
  type: MavParamType,
  index: number,
  count: number,
  seq: number,
): number[] {
  const msg = new ParamValue();
  msg.paramId = name;
  msg.paramType = type;
  msg.paramIndex = index;
  msg.paramCount = count;
  msg.paramValue = 0;
  const packet = encodePacket(msg, { seq, sysid: 1, compid: 1 });
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  view.setUint32(10, paramValueToWireBits(value, type), true); // header is 10 bytes, param_value is offset 0
  const crcInput = packet.subarray(1, packet.length - 2);
  const crc = x25Crc(crcInput, ParamValue.MAGIC_NUMBER);
  view.setUint8(packet.length - 2, crc & 0xff);
  view.setUint8(packet.length - 1, (crc >> 8) & 0xff);
  return Array.from(packet);
}

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
  const getTelemetryNavButton = () => screen.getByRole("tab", { name: "Телеметрія" });
  const getParametersNavButton = () => screen.getByRole("tab", { name: "Параметри" });
  const getMotorsNavButton = () => screen.getByRole("tab", { name: "Налаштування моторів" });
  const getPidTuneNavButton = () => screen.getByRole("tab", { name: "Налаштування PID" });

  const clickSerialMode = () => user.click(getSerialModeButton());
  const clickUdpMode = () => user.click(getUdpModeButton());
  const clickRefreshPorts = () => user.click(getRefreshPortsButton());
  const clickConnect = () => user.click(getConnectButton());
  const clickDisconnect = () => user.click(getDisconnectButton());
  const clickParametersNav = () => user.click(getParametersNavButton());
  const clickTelemetryNav = () => user.click(getTelemetryNavButton());

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
    getTelemetryNavButton,
    getParametersNavButton,
    getMotorsNavButton,
    getPidTuneNavButton,
    clickSerialMode,
    clickUdpMode,
    clickRefreshPorts,
    clickConnect,
    clickDisconnect,
    clickParametersNav,
    clickTelemetryNav,
  };
}

beforeEach(() => {
  mockWindows("main");
  // ParametersPanel fetches parameter documentation from ardupilot.org in the background -
  // tests must never depend on real network access, and a real attempt would also slow
  // every test in this file down waiting on it. Rejecting immediately exercises the
  // panel's own "descriptions are a nice-to-have" fallback (no HoverCard, plain param
  // names) rather than actually skipping the fetch attempt.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled in tests")));
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
  useMavlinkVehicleStore.getState().reset();
  useMavlinkTelemetryStore.getState().reset();
  useMavlinkParameterStore.getState().reset();
  vi.unstubAllGlobals();
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

  it("decodes a real HEARTBEAT pushed through the data event and shows the vehicle panel", async () => {
    mockBackend();
    const { clickConnect, getStatusAlert } = getView();
    await clickConnect();
    await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
    await within(getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");

    const hb = new Heartbeat();
    hb.type = MavType.QUADROTOR;
    hb.autopilot = MavAutopilot.ARDUPILOTMEGA;
    hb.baseMode = MavModeFlag.SAFETY_ARMED | MavModeFlag.STABILIZE_ENABLED | MavModeFlag.CUSTOM_MODE_ENABLED;
    hb.customMode = 4; // ArduCopter GUIDED
    hb.systemStatus = MavState.ACTIVE;
    hb.mavlinkVersion = 3;
    const packet = encodePacket(hb, { seq: 1, sysid: 1, compid: 1 });

    await emit("mavlink-transport://data", { bytes: Array.from(packet) });

    expect(await screen.findByText("Квадрокоптер")).toBeInTheDocument();
    expect(screen.getByText("ArduPilot")).toBeInTheDocument();
    expect(screen.getByText("Активний")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    // "Armed" appears as both a label and the current value - assert at least one match.
    expect(screen.getAllByText("Озброєно").length).toBeGreaterThan(0);
    expect(screen.queryByText("Очікування першого heartbeat від апарата...")).not.toBeInTheDocument();
  });

  it("sends its own periodic GCS heartbeat once connected", async () => {
    const invoked = vi.fn();
    mockBackend(invoked);
    const { clickConnect, getStatusAlert } = getView();
    await clickConnect();

    await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
    await within(getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");

    await vi.waitFor(() => {
      expect(invoked.mock.calls.some(([cmd]) => cmd === "send_bytes")).toBe(true);
    });
    const sendCall = invoked.mock.calls.find(([cmd]) => cmd === "send_bytes");
    const sentBytes = (sendCall?.[1] as { bytes: number[] } | undefined)?.bytes;
    expect(sentBytes?.[0]).toBe(0xfd); // MAVLink v2 start byte
    expect(sentBytes?.[7]).toBe(0); // HEARTBEAT msg id
  });

  it("decodes live telemetry messages and shows them in the telemetry dashboard", async () => {
    mockBackend();
    const { clickConnect, getStatusAlert } = getView();
    await clickConnect();
    await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
    await within(getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");

    const hb = new Heartbeat();
    hb.type = MavType.QUADROTOR;
    hb.autopilot = MavAutopilot.ARDUPILOTMEGA;
    hb.baseMode = MavModeFlag.STABILIZE_ENABLED;
    hb.customMode = 0;
    hb.systemStatus = MavState.ACTIVE;
    hb.mavlinkVersion = 3;
    await emit("mavlink-transport://data", { bytes: Array.from(encodePacket(hb, { seq: 1, sysid: 1, compid: 1 })) });
    await screen.findByText("Активний");

    const att = new Attitude();
    att.roll = 0.1745329; // ~10 deg
    att.pitch = -0.0872665; // ~-5 deg
    att.yaw = 1.5707963; // 90 deg
    await emit("mavlink-transport://data", { bytes: Array.from(encodePacket(att, { seq: 2, sysid: 1, compid: 1 })) });

    const vfr = new VfrHud();
    vfr.airspeed = 12.3;
    vfr.groundspeed = 11.8;
    vfr.alt = 123.4;
    vfr.climb = 0.5;
    vfr.heading = 267; // deliberately not a multiple of the tape's 10-degree tick step
    vfr.throttle = 65;
    await emit("mavlink-transport://data", { bytes: Array.from(encodePacket(vfr, { seq: 3, sysid: 1, compid: 1 })) });

    const sys = new SysStatus();
    sys.voltageBattery = 16800; // mV
    sys.currentBattery = 520; // cA
    sys.batteryRemaining = 77; // %
    await emit("mavlink-transport://data", { bytes: Array.from(encodePacket(sys, { seq: 4, sysid: 1, compid: 1 })) });

    const gps = new GpsRawInt();
    gps.fixType = GpsFixType.GPS_FIX_TYPE_3D_FIX;
    gps.satellitesVisible = 14;
    await emit("mavlink-transport://data", { bytes: Array.from(encodePacket(gps, { seq: 5, sysid: 1, compid: 1 })) });

    const pos = new GlobalPositionInt();
    pos.lat = 504500000; // 50.45 deg * 1e7
    pos.lon = 305200000; // 30.52 deg * 1e7
    pos.relativeAlt = 100000; // 100 m in mm
    await emit("mavlink-transport://data", { bytes: Array.from(encodePacket(pos, { seq: 6, sysid: 1, compid: 1 })) });

    // Roll/pitch/yaw drive the attitude ball's geometry (rotation/translation), not text -
    // covered directly by PrimaryFlightDisplay's own tests. Here we check the values that do
    // render as text: the PFD's speed/altitude/heading tape readouts, the mode badge, and the
    // plain-text battery/GPS/position rows kept below the PFD.
    expect(await screen.findByText("12.3")).toBeInTheDocument(); // airspeed tape
    expect(screen.getByText("123")).toBeInTheDocument(); // altitude tape
    expect(screen.getByText("267")).toBeInTheDocument(); // heading tape
    expect(screen.getByTestId("pfd-armed-badge")).toHaveTextContent("Не озброєно");
    expect(screen.getByTestId("pfd-mode-badge")).toHaveTextContent("0"); // raw customMode - not Plane
    expect(screen.getByText("16.80 V")).toBeInTheDocument();
    expect(screen.getByText("5.2 A")).toBeInTheDocument();
    expect(screen.getByText("77%")).toBeInTheDocument();
    expect(screen.getByText("3D-фіксація")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("50.450000, 30.520000")).toBeInTheDocument();
    expect(screen.queryByText("Очікування телеметрії...")).not.toBeInTheDocument();
  });

  it("requests telemetry data streams once the vehicle's heartbeat is known", async () => {
    const invoked = vi.fn();
    mockBackend(invoked);
    const { clickConnect, getStatusAlert } = getView();
    await clickConnect();
    await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
    await within(getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");

    invoked.mockClear();
    await emit("mavlink-transport://data", { bytes: sampleHeartbeatBytes() });

    await vi.waitFor(() => {
      const requestStreamCalls = invoked.mock.calls.filter(([cmd, payload]) => {
        if (cmd !== "send_bytes") return false;
        const bytes = (payload as { bytes: number[] }).bytes;
        return bytes[7] === RequestDataStream.MSG_ID;
      });
      expect(requestStreamCalls.length).toBe(4);
    });
  });

  describe("auto-connect", () => {
    function calledWithPort(invoked: ReturnType<typeof vi.fn>, cmd: string, port: string) {
      return invoked.mock.calls.some(
        ([c, payload]) => c === cmd && (payload as { portName?: string } | undefined)?.portName === port,
      );
    }

    it("connects immediately when the first candidate port responds with a heartbeat", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { clickSerialMode, user, getStatusAlert } = getView();
      await clickSerialMode();
      await screen.findByRole("option", { name: "COM3 - USB Serial" });

      await user.click(screen.getByRole("button", { name: "Автовизначення" }));

      await vi.waitFor(() => expect(calledWithPort(invoked, "connect_serial", "COM3")).toBe(true));
      await emit("mavlink-transport://status", { kind: "connected", detail: "serial:COM3@57600" });
      await emit("mavlink-transport://data", { bytes: sampleHeartbeatBytes() });

      expect(await within(getStatusAlert()).findByText("Підключено: serial:COM3@57600")).toBeInTheDocument();
      expect(screen.getByLabelText("Серійний порт")).toHaveValue("COM3");
    });

    it(
      "tries the next port only after exhausting every baud rate on the first one",
      async () => {
        const invoked = vi.fn();
        mockBackend(invoked);
        const { clickSerialMode, user, getStatusAlert } = getView();
        await clickSerialMode();
        await screen.findByRole("option", { name: "COM3 - USB Serial" });

        await user.click(screen.getByRole("button", { name: "Автовизначення" }));

        await vi.waitFor(() => expect(calledWithPort(invoked, "connect_serial", "COM3")).toBe(true));
        await emit("mavlink-transport://status", { kind: "connected", detail: "serial:COM3@57600" });
        // No heartbeat for COM3 at any baud rate - the scan must exhaust all 5 standard
        // rates on this port (real timers, ~2s each) before moving on to COM4.

        await vi.waitFor(() => expect(calledWithPort(invoked, "connect_serial", "COM4")).toBe(true), {
          timeout: 15000,
        });
        const com3Attempts = invoked.mock.calls.filter(
          ([c, payload]) => c === "connect_serial" && (payload as { portName?: string } | undefined)?.portName === "COM3",
        ).length;
        expect(com3Attempts).toBe(5); // every standard baud rate was tried on COM3 before giving up on it

        await emit("mavlink-transport://status", { kind: "connected", detail: "serial:COM4@57600" });
        await emit("mavlink-transport://data", { bytes: sampleHeartbeatBytes() });

        expect(await within(getStatusAlert()).findByText("Підключено: serial:COM4@57600")).toBeInTheDocument();
        expect(screen.getByLabelText("Серійний порт")).toHaveValue("COM4");
      },
      20000,
    );

    it(
      "shows an error when no candidate port produces a heartbeat at any baud rate",
      async () => {
        const invoked = vi.fn();
        mockIPC(
          (cmd, payload) => {
            invoked(cmd, payload);
            if (cmd === "list_serial_ports") return [{ name: "COM3", description: "USB Serial" }];
            return undefined;
          },
          { shouldMockEvents: true },
        );
        const { clickSerialMode, user, getStatusAlert } = getView();
        await clickSerialMode();
        await screen.findByRole("option", { name: "COM3 - USB Serial" });

        await user.click(screen.getByRole("button", { name: "Автовизначення" }));

        await vi.waitFor(() => expect(calledWithPort(invoked, "connect_serial", "COM3")).toBe(true));
        await emit("mavlink-transport://status", { kind: "connected", detail: "serial:COM3@57600" });
        // Never emit a heartbeat, at any baud rate.

        expect(
          await within(getStatusAlert()).findByText(
            "Помилка підключення: Не знайдено heartbeat ArduPilot на жодному порту",
            {},
            { timeout: 15000 },
          ),
        ).toBeInTheDocument();
      },
      20000,
    );
  });

  describe("sidebar navigation", () => {
    it("shows the telemetry section by default and switches to Parameters/Motors/PID Tune on click", async () => {
      mockBackend();
      const { clickConnect, getStatusAlert, clickParametersNav, getMotorsNavButton, getPidTuneNavButton, user } =
        getView();
      await clickConnect();
      await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");

      expect(screen.getByText("Апарат")).toBeInTheDocument(); // telemetry section shown by default

      await clickParametersNav();
      expect(screen.queryByText("Апарат")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Завантажити параметри" })).toBeInTheDocument();

      await user.click(getMotorsNavButton());
      expect(screen.getByText("Тест моторів/сервоприводів і налаштування рами - у наступному релізі.")).toBeInTheDocument();

      await user.click(getPidTuneNavButton());
      expect(screen.getByText("Налаштування PID - у наступному релізі.")).toBeInTheDocument();
    });

    it("shows a not-connected placeholder before any connection attempt", () => {
      mockBackend();
      getView();
      expect(screen.getByText("Підключіться до апарата, щоб побачити цей розділ.")).toBeInTheDocument();
    });
  });

  describe("parameters", () => {
    async function connectWithVehicle() {
      const view = getView();
      await view.clickConnect();
      await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit("mavlink-transport://data", { bytes: sampleHeartbeatBytes() });
      await view.clickParametersNav();
      return view;
    }

    it("requests the full parameter list and lists params as PARAM_VALUE packets arrive", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectWithVehicle();

      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));

      await vi.waitFor(() => {
        const listRequest = invoked.mock.calls.find(([cmd, payload]) => {
          if (cmd !== "send_bytes") return false;
          const bytes = (payload as { bytes: number[] }).bytes;
          return bytes[7] === ParamRequestList.MSG_ID;
        });
        expect(listRequest).toBeDefined();
      });

      await emit("mavlink-transport://data", {
        bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 2, 1),
      });

      expect(await screen.findByText("ARSPD_USE")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("Отримано 1 / 2")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Запросити відсутні" })).toBeInTheDocument();
    });

    it("re-requests only the missing indices, not the whole list", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectWithVehicle();
      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));
      await emit("mavlink-transport://data", {
        bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 3, 1),
      });
      await screen.findByText("ARSPD_USE");
      invoked.mockClear();

      await user.click(screen.getByRole("button", { name: "Запросити відсутні" }));

      await vi.waitFor(() => {
        const readRequests = invoked.mock.calls.filter(([cmd, payload]) => {
          if (cmd !== "send_bytes") return false;
          const bytes = (payload as { bytes: number[] }).bytes;
          return bytes[7] === ParamRequestRead.MSG_ID;
        });
        expect(readRequests.length).toBe(2); // indices 1 and 2 - index 0 was already received
      });
    });

    it("stages an edit locally without sending anything until Save all is confirmed", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectWithVehicle();
      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));
      await emit("mavlink-transport://data", {
        bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 1, 1),
      });
      await screen.findByText("ARSPD_USE");
      invoked.mockClear();

      await user.click(screen.getByText("1"));
      const input = screen.getByDisplayValue("1");
      await user.clear(input);
      await user.type(input, "-5{Enter}");

      // Staged, not sent yet. The periodic GCS heartbeat legitimately calls send_bytes on its
      // own 1s interval, so check specifically for the absence of a PARAM_SET, not of any
      // send_bytes call at all (an overly broad check here is flaky under real timers).
      const sentParamSet = () =>
        invoked.mock.calls.some(([cmd, payload]) => {
          if (cmd !== "send_bytes") return false;
          const bytes = (payload as { bytes: number[] }).bytes;
          return bytes[7] === ParamSet.MSG_ID;
        });

      expect(await screen.findByText("-5")).toBeInTheDocument();
      expect(screen.getByText("змінено")).toBeInTheDocument();
      expect(sentParamSet()).toBe(false);

      const saveAllButton = screen.getByRole("button", { name: "Зберегти все (1)" });
      await user.click(saveAllButton);

      // Confirmation dialog shows the From/To change before anything is sent.
      expect(screen.getByRole("heading", { name: "Підтвердіть зміни параметрів" })).toBeInTheDocument();
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("ARSPD_USE")).toBeInTheDocument();
      expect(within(dialog).getByText("1")).toBeInTheDocument();
      expect(within(dialog).getByText("-5")).toBeInTheDocument();
      expect(sentParamSet()).toBe(false);

      await user.click(within(dialog).getByRole("button", { name: "Надіслати зміни" }));

      await vi.waitFor(() => {
        const setRequest = invoked.mock.calls.find(([cmd, payload]) => {
          if (cmd !== "send_bytes") return false;
          const bytes = (payload as { bytes: number[] }).bytes;
          return bytes[7] === ParamSet.MSG_ID;
        });
        expect(setRequest).toBeDefined();
        const sentBytes = (setRequest?.[1] as { bytes: number[] }).bytes;
        const sentBits = new DataView(new Uint8Array(sentBytes).buffer).getUint32(10, true);
        expect(sentBits).toBe(paramValueToWireBits(-5, MavParamType.INT8));
      });

      expect(screen.getByText("очікує")).toBeInTheDocument(); // now dirty (sent, awaiting the vehicle's ack)
      expect(screen.queryByText("змінено")).not.toBeInTheDocument();
    });

    it("Reset discards a staged edit without sending anything", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectWithVehicle();
      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));
      await emit("mavlink-transport://data", {
        bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 1, 1),
      });
      await screen.findByText("ARSPD_USE");
      invoked.mockClear();

      await user.click(screen.getByText("1"));
      const input = screen.getByDisplayValue("1");
      await user.clear(input);
      await user.type(input, "-5{Enter}");
      await screen.findByText("-5");

      await user.click(screen.getByRole("button", { name: "Скинути" }));

      expect(await screen.findByText("1")).toBeInTheDocument();
      expect(screen.queryByText("-5")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Зберегти все/ })).not.toBeInTheDocument();
      expect(invoked.mock.calls.some(([cmd]) => cmd === "send_bytes")).toBe(false);
    });

    it("shows an unavailable message and a dash in the description column when descriptions fail to load", async () => {
      // The file-wide beforeEach already stubs fetch to always reject.
      mockBackend();
      const { user } = await connectWithVehicle();
      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));
      await emit("mavlink-transport://data", {
        bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 1, 1),
      });
      await screen.findByText("ARSPD_USE");

      expect(
        await screen.findByText("Описи параметрів недоступні (не вдалося з'єднатися з ardupilot.org)."),
      ).toBeInTheDocument();
      expect(screen.getByText("-")).toBeInTheDocument();
    });

    it("shows the fetched description and a Read more link once parameter documentation loads", async () => {
      const sampleXml = `<?xml version="1.0"?><paramfile><vehicles><parameters name="ArduCopter">
        <param humanName="Use airspeed" name="ArduCopter:ARSPD_USE" documentation="Enables airspeed use"></param>
      </parameters></vehicles></paramfile>`;
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(sampleXml) }));

      mockBackend();
      const { user } = await connectWithVehicle(); // sampleHeartbeatBytes() reports MavType.QUADROTOR -> ArduCopter
      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));
      await emit("mavlink-transport://data", {
        bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 1, 1),
      });
      await screen.findByText("ARSPD_USE");

      expect(await screen.findByText("Use airspeed")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Детальніше →" })).toHaveAttribute(
        "href",
        "https://ardupilot.org/copter/docs/parameters.html#arspd-use",
      );
    });
  });
});
