import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { encodePacket } from "../../../mavlink/codec/codec";
import { x25Crc } from "../../../mavlink/crc/crc";
import { paramValueToWireBits, paramWireBitsToValue, readParamValueBits } from "../../../mavlink/paramValueCodec/paramValueCodec";
import {
  AccelcalVehiclePos,
  AccelcalVehiclePosCommand,
  Attitude,
  CommandAck,
  GlobalPositionInt,
  GpsFixType,
  GpsRawInt,
  Heartbeat,
  MagCalProgress,
  MagCalReport,
  MagCalStatus,
  MavAutopilot,
  MavCmd,
  MavModeFlag,
  MavParamType,
  MavResult,
  MavState,
  MavType,
  ParamRequestList,
  ParamRequestRead,
  ParamSet,
  ParamValue,
  RcChannels,
  RebootShutdownAction,
  RequestDataStream,
  ServoOutputRaw,
  SysStatus,
  VfrHud,
} from "../../../mavlink/registry/registry";
import { useMavlinkAccelCalStore } from "../../../stores/mavlinkAccelCalStore/mavlinkAccelCalStore";
import { useMavlinkCompassCalStore } from "../../../stores/mavlinkCompassCalStore/mavlinkCompassCalStore";
import { useMavlinkConnectionStore } from "../../../stores/mavlinkConnectionStore/mavlinkConnectionStore";
import { useMavlinkParameterStore } from "../../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { useMavlinkRcCalStore } from "../../../stores/mavlinkRcCalStore/mavlinkRcCalStore";
import { useMavlinkTelemetryStore } from "../../../stores/mavlinkTelemetryStore/mavlinkTelemetryStore";
import { useMavlinkVehicleStore } from "../../../stores/mavlinkVehicleStore/mavlinkVehicleStore";
import { ArduPilotSetupView } from "../ArduPilotSetupView";

// ParametersPanel virtualizes its table (see ParametersPanel.tsx) via useVirtualizer, which
// measures the real scroll container's height to decide which rows are "in view" - jsdom does
// no real layout, so the container always measures 0 and every real virtualizer would render
// zero rows regardless of how few params exist. Mocked the same way CesiumMapView.test.tsx
// mocks Cesium's Viewer: only the piece that needs a real browser is replaced, here with a
// "no windowing" stand-in that reports every item as visible, so these tests keep exercising
// the real search/edit/save logic against a real (if small) DOM instead of an empty one.
const PARAM_ROW_HEIGHT_PX = 36;
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, start: index * PARAM_ROW_HEIGHT_PX, size: PARAM_ROW_HEIGHT_PX, key: index })),
    getTotalSize: () => count * PARAM_ROW_HEIGHT_PX,
  }),
}));

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

function samplePlaneHeartbeatBytes(): number[] {
  const hb = new Heartbeat();
  hb.type = MavType.FIXED_WING;
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

/** Builds real MAG_CAL_PROGRESS wire bytes, incl. a correct CRC - no NaN-collapse risk here
 *  (unlike PARAM_VALUE), so a plain encodePacket() is safe for every field. */
function buildMagCalProgressBytes(
  compassId: number,
  calStatus: MagCalStatus,
  completionPct: number,
  completionMask: number[],
  seq: number,
): number[] {
  const msg = new MagCalProgress();
  msg.directionX = 0;
  msg.directionY = 0;
  msg.directionZ = 0;
  msg.compassId = compassId;
  msg.calMask = 0b111;
  msg.calStatus = calStatus;
  msg.attempt = 1;
  msg.completionPct = completionPct;
  msg.completionMask = completionMask;
  return Array.from(encodePacket(msg, { seq, sysid: 1, compid: 1 }));
}

function buildMagCalReportBytes(compassId: number, calStatus: MagCalStatus, fitness: number, seq: number): number[] {
  const msg = new MagCalReport();
  msg.fitness = fitness;
  msg.ofsX = 1;
  msg.ofsY = 2;
  msg.ofsZ = 3;
  msg.diagX = 1;
  msg.diagY = 1;
  msg.diagZ = 1;
  msg.offdiagX = 0;
  msg.offdiagY = 0;
  msg.offdiagZ = 0;
  msg.compassId = compassId;
  msg.calMask = 0b111;
  msg.calStatus = calStatus;
  msg.autosaved = 0;
  return Array.from(encodePacket(msg, { seq, sysid: 1, compid: 1 }));
}

function buildCommandAckBytes(command: number, result: MavResult, seq: number): number[] {
  const msg = new CommandAck();
  msg.command = command;
  msg.result = result;
  msg.progress = 0;
  msg.resultParam2 = 0;
  msg.targetSystem = 255;
  msg.targetComponent = 190;
  return Array.from(encodePacket(msg, { seq, sysid: 1, compid: 1 }));
}

/** Builds real ACCELCAL_VEHICLE_POS wire bytes as the vehicle itself would send them (see
 *  registry.ts's export comment - this is one of the few commands sent vehicle->GCS). */
function buildAccelcalVehiclePosBytes(position: AccelcalVehiclePos, seq: number): number[] {
  const cmd = new AccelcalVehiclePosCommand(255, 190);
  cmd.position = position;
  return Array.from(encodePacket(cmd, { seq, sysid: 1, compid: 1 }));
}

/** Finds a sent COMMAND_LONG (msg 76) whose `command` field (uint16_t at payload offset 28,
 *  i.e. absolute byte 38 of the packet) matches the given MAV_CMD id. */
function findCommandLongSend(invoked: ReturnType<typeof vi.fn>, mavCmd: number) {
  return invoked.mock.calls.find(([cmd, payload]) => {
    if (cmd !== "send_bytes") return false;
    const bytes = (payload as { bytes: number[] }).bytes;
    if (bytes[7] !== 76) return false;
    const view = new DataView(new Uint8Array(bytes).buffer);
    return view.getUint16(38, true) === mavCmd;
  });
}

const MAV_CMD_DO_SET_SERVO = 183;
const MAV_CMD_DO_MOTOR_TEST = 209;

/** Finds the MOST RECENT sent DO_SET_SERVO (instance=channel) and returns its commanded pwm
 *  (param2), or undefined if no such send happened - "most recent" matters here since a
 *  press-and-hold test sends two DO_SET_SERVOs for the same channel (deflect, then trim) and
 *  the test needs to distinguish which one happened last. param1/param2 are plain
 *  COMMAND_LONG floats - no NaN-collapse risk here (unlike PARAM_VALUE), so a direct
 *  getFloat32 read is safe. */
function findSetServoPwm(invoked: ReturnType<typeof vi.fn>, channel: number): number | undefined {
  const matches = invoked.mock.calls.filter(([cmd, payload]) => {
    if (cmd !== "send_bytes") return false;
    const bytes = (payload as { bytes: number[] }).bytes;
    if (bytes[7] !== 76) return false;
    const view = new DataView(new Uint8Array(bytes).buffer);
    return view.getUint16(38, true) === MAV_CMD_DO_SET_SERVO && view.getFloat32(10, true) === channel;
  });
  const last = matches.at(-1);
  if (!last) return undefined;
  const bytes = (last[1] as { bytes: number[] }).bytes;
  return new DataView(new Uint8Array(bytes).buffer).getFloat32(14, true);
}

/** Finds the MOST RECENT sent DO_MOTOR_TEST (instance=motor) and returns its commanded
 *  throttle percent (param3), or undefined if no such send happened - same "most recent"
 *  reasoning as findSetServoPwm above (a press-and-hold sends throttle=10 then throttle=0). */
function findMotorTestThrottle(invoked: ReturnType<typeof vi.fn>, motor: number): number | undefined {
  const matches = invoked.mock.calls.filter(([cmd, payload]) => {
    if (cmd !== "send_bytes") return false;
    const bytes = (payload as { bytes: number[] }).bytes;
    if (bytes[7] !== 76) return false;
    const view = new DataView(new Uint8Array(bytes).buffer);
    return view.getUint16(38, true) === MAV_CMD_DO_MOTOR_TEST && view.getFloat32(10, true) === motor;
  });
  const last = matches.at(-1);
  if (!last) return undefined;
  const bytes = (last[1] as { bytes: number[] }).bytes;
  return new DataView(new Uint8Array(bytes).buffer).getFloat32(18, true); // param3 = throttle
}

/** Builds real SERVO_OUTPUT_RAW wire bytes reporting up to 8 channel values for the given
 *  port bank (0 = channels 1-8, 1 = channels 9-16) - matches ArduPilot's real MAIN/AUX
 *  convention (confirmed against MAVLink's own common.xml, not assumed). */
function buildServoOutputRawBytes(port: number, values: number[], seq: number): number[] {
  const msg = new ServoOutputRaw();
  msg.timeUsec = 0;
  msg.port = port;
  msg.servo1Raw = values[0] ?? 0;
  msg.servo2Raw = values[1] ?? 0;
  msg.servo3Raw = values[2] ?? 0;
  msg.servo4Raw = values[3] ?? 0;
  msg.servo5Raw = values[4] ?? 0;
  msg.servo6Raw = values[5] ?? 0;
  msg.servo7Raw = values[6] ?? 0;
  msg.servo8Raw = values[7] ?? 0;
  return Array.from(encodePacket(msg, { seq, sysid: 1, compid: 1 }));
}

/** Builds real RC_CHANNELS wire bytes reporting the given per-channel raw PWM values (1-indexed
 *  via `values[1]` = channel 1, etc.) - unset channels report UINT16_MAX (unused), not 0, per
 *  MAVLink's own common.xml. */
function buildRcChannelsBytes(values: Partial<Record<number, number>>, chancount: number, seq: number): number[] {
  const msg = new RcChannels();
  msg.chancount = chancount;
  const chan = (n: number) => values[n] ?? 0xffff;
  msg.chan1Raw = chan(1);
  msg.chan2Raw = chan(2);
  msg.chan3Raw = chan(3);
  msg.chan4Raw = chan(4);
  msg.chan5Raw = chan(5);
  msg.chan6Raw = chan(6);
  msg.chan7Raw = chan(7);
  msg.chan8Raw = chan(8);
  msg.chan9Raw = chan(9);
  msg.chan10Raw = chan(10);
  msg.chan11Raw = chan(11);
  msg.chan12Raw = chan(12);
  msg.chan13Raw = chan(13);
  msg.chan14Raw = chan(14);
  msg.chan15Raw = chan(15);
  msg.chan16Raw = chan(16);
  msg.chan17Raw = chan(17);
  msg.chan18Raw = chan(18);
  return Array.from(encodePacket(msg, { seq, sysid: 1, compid: 1 }));
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
  const getDevModeButton = () => screen.getByRole("button", { name: "Режим розробника" });
  const getDevModeCopterButton = () => screen.getByRole("button", { name: "Режим розробника (мультикоптер)" });
  const getDevFramePresetSelect = () => screen.getByLabelText("Тип рами для тестового мультикоптера");
  // Scoped to the header (role="banner", the top-level <header>) rather than a bare
  // screen.getByRole("alert") - the live map embedded on the Telemetry page (see
  // LiveMapSection.tsx) renders its own "need a Cesium token" info alert in <main>, which
  // would otherwise collide with this one whenever a test lands on Telemetry (the default
  // section) after connecting.
  const getStatusAlert = () => within(screen.getByRole("banner")).getByRole("alert");
  const getTelemetryNavButton = () => screen.getByRole("tab", { name: "Телеметрія" });
  const getParametersNavButton = () => screen.getByRole("tab", { name: "Параметри" });
  const getCompassCalNavButton = () => screen.getByRole("tab", { name: "Калібрування компаса" });
  const getAccelCalNavButton = () => screen.getByRole("tab", { name: "Калібрування акселерометра" });
  const getRcCalNavButton = () => screen.getByRole("tab", { name: "Калібрування RC" });
  const getMotorsNavButton = () => screen.getByRole("tab", { name: "Налаштування моторів" });
  const getPidTuneNavButton = () => screen.getByRole("tab", { name: "Налаштування PID" });

  const clickSerialMode = () => user.click(getSerialModeButton());
  const clickUdpMode = () => user.click(getUdpModeButton());
  const clickRefreshPorts = () => user.click(getRefreshPortsButton());
  const clickConnect = () => user.click(getConnectButton());
  const clickDisconnect = () => user.click(getDisconnectButton());
  const clickDevMode = () => user.click(getDevModeButton());
  const clickDevModeCopter = () => user.click(getDevModeCopterButton());
  const clickParametersNav = () => user.click(getParametersNavButton());
  const clickTelemetryNav = () => user.click(getTelemetryNavButton());
  const clickCompassCalNav = () => user.click(getCompassCalNavButton());
  const clickAccelCalNav = () => user.click(getAccelCalNavButton());
  const clickRcCalNav = () => user.click(getRcCalNavButton());
  const clickMotorsNav = () => user.click(getMotorsNavButton());

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
    getDevModeButton,
    getDevModeCopterButton,
    getDevFramePresetSelect,
    getStatusAlert,
    getTelemetryNavButton,
    getParametersNavButton,
    getCompassCalNavButton,
    getAccelCalNavButton,
    getRcCalNavButton,
    getMotorsNavButton,
    getPidTuneNavButton,
    clickSerialMode,
    clickUdpMode,
    clickRefreshPorts,
    clickConnect,
    clickDisconnect,
    clickDevMode,
    clickDevModeCopter,
    clickParametersNav,
    clickTelemetryNav,
    clickCompassCalNav,
    clickAccelCalNav,
    clickRcCalNav,
    clickMotorsNav,
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
  useMavlinkCompassCalStore.getState().reset();
  useMavlinkAccelCalStore.getState().reset();
  useMavlinkRcCalStore.getState().reset();
  vi.unstubAllGlobals();
});

describe("ArduPilotSetupView", () => {
  it("renders the heading and description", () => {
    mockBackend();
    getView();
    expect(screen.getByRole("heading", { name: "Налаштування ArduPilot" })).toBeInTheDocument();
  });

  it("shows the live map section (Cesium token gate, since no token is saved) inline on the Telemetry page, not as a separate tab", async () => {
    const { clickDevMode, getStatusAlert } = getView();
    await clickDevMode();
    await within(getStatusAlert()).findByText("Підключено: Dev mode (simulated vehicle)");
    // Telemetry is the default/starting section - no nav click needed to see the map.
    expect(screen.getByPlaceholderText("Вставте сюди свій токен Cesium ion")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Карта" })).not.toBeInTheDocument();
  });

  it("links back to Home", () => {
    mockBackend();
    const { getBackToHomeLink } = getView();
    expect(getBackToHomeLink()).toHaveAttribute("href", "/");
  });

  it("defaults to Serial mode, since USB is the more common way to connect to real hardware", () => {
    mockBackend();
    const { getSerialPortSelect } = getView();
    expect(getSerialPortSelect()).toBeInTheDocument();
  });

  it("switching to UDP mode shows the listen-port input, starting at 14550", async () => {
    mockBackend();
    const { clickUdpMode, getUdpPortInput } = getView();
    await clickUdpMode();
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
    const { clickUdpMode, clickConnect, getStatusAlert, getDisconnectButton } = getView();

    await clickUdpMode();
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
      expect(requestStreamCalls.length).toBe(5);
    });
  });

  describe("Dev Mode", () => {
    // No mockBackend()/mockIPC() in most of these - Dev Mode's whole point is to work with
    // no real Tauri backend at all, and the simulator (mockVehicleSimulator.ts) is a real,
    // separately-unit-tested MAVLink peer, not a shortcut - these tests exercise the exact
    // same decode/store/render pipeline a real vehicle connection would.

    it("connects to a simulated Plane and shows live vehicle info, with no backend mocked at all", async () => {
      const { clickDevMode, getStatusAlert } = getView();

      await clickDevMode();

      await within(getStatusAlert()).findByText(/Підключено/);
      expect(await screen.findByText("Літак (крило)")).toBeInTheDocument();
    });

    it("loading parameters exercises the real load/list/missing-param round trip against the simulator", async () => {
      const { user, clickDevMode, clickParametersNav, getStatusAlert } = getView();
      await clickDevMode();
      await within(getStatusAlert()).findByText(/Підключено/);
      await clickParametersNav();

      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));

      expect(await screen.findByText("ARSPD_USE")).toBeInTheDocument();
      // SERVO3_TRIM is deliberately withheld from the initial dump by the simulator (see
      // mockVehicleSimulator.ts) to give "Request missing" something real to do.
      expect(screen.queryByText("SERVO3_TRIM")).not.toBeInTheDocument();
      expect(await screen.findByRole("button", { name: "Запросити відсутні" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Запросити відсутні" }));
      expect(await screen.findByText("SERVO3_TRIM")).toBeInTheDocument();
    });

    it(
      "Motors & Servos lists the simulated channels and reflects a real press-and-hold test's live output",
      async () => {
        const { user, clickDevMode, clickMotorsNav, getStatusAlert } = getView();
        await clickDevMode();
        await within(getStatusAlert()).findByText(/Підключено/);
        await clickMotorsNav();

        await user.click(screen.getByRole("button", { name: "Завантажити виходи серво" }));

        const testButtons = await screen.findAllByRole("button", { name: "Утримуйте для тесту" });
        expect(testButtons.length).toBeGreaterThanOrEqual(3); // 3 active seeded channels, 1 disabled

        fireEvent.pointerDown(testButtons[0]!);
        // Channel 1's seeded range is min=1000/max=2000/trim=1500, so the press-and-hold
        // deflection (30% of the larger side's room) lands at exactly 1650 - this is the
        // simulator's own SERVO_OUTPUT_RAW echo, not an assumed/optimistic local value.
        await screen.findByText("1650 us");
      },
      10000,
    );
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
      // No vehicle heartbeat was emitted in this test, so vehicleType falls back to GENERIC
      // -> ArduCopter folder -> the Copter frame/motor UI, not the Plane servo UI.
      expect(screen.getByText("Клас і тип рами ще не завантажено.")).toBeInTheDocument();

      await user.click(getPidTuneNavButton());
      // No vehicle heartbeat was emitted in this test, so vehicleType falls back to GENERIC
      // -> ArduCopter folder, same as the Motors tab above - the real PID Tune UI, not a
      // "coming soon" placeholder.
      expect(screen.getByText("Параметри PID ще не завантажено.")).toBeInTheDocument();
    });

    it("shows a not-connected placeholder before any connection attempt", () => {
      mockBackend();
      getView();
      expect(screen.getByText("Підключіться до апарата, щоб побачити цей розділ.")).toBeInTheDocument();
    });
  });

  describe("motors & servos (Plane)", () => {
    async function connectPlaneAndOpenMotors() {
      const view = getView();
      await view.clickConnect();
      await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit("mavlink-transport://data", { bytes: samplePlaneHeartbeatBytes() });
      await view.clickMotorsNav();
      return view;
    }

    it("shows a safety warning and Load button for a connected Plane", async () => {
      mockBackend();
      await connectPlaneAndOpenMotors();
      expect(
        screen.getByText("Переконайтеся, що керуючі поверхні можуть вільно рухатися і нічим не перешкоджені, перед тестуванням."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Завантажити виходи серво" })).toBeInTheDocument();
      expect(screen.getByText("Виходи серво ще не завантажено.")).toBeInTheDocument();
    });

    it("requests SERVOx_FUNCTION/MIN/MAX/TRIM by name for all 16 channels when Load is clicked", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectPlaneAndOpenMotors();

      await user.click(screen.getByRole("button", { name: "Завантажити виходи серво" }));

      const byNameRequests = invoked.mock.calls.filter(([cmd, payload]) => {
        if (cmd !== "send_bytes") return false;
        const bytes = (payload as { bytes: number[] }).bytes;
        return bytes[7] === ParamRequestRead.MSG_ID;
      });
      expect(byNameRequests.length).toBe(16 * 4);

      const requestedNames = new Set(
        byNameRequests.map(([, payload]) => {
          const bytes = (payload as { bytes: number[] }).bytes;
          // param_id: char[16] at payload offset 4 (after param_index:int16, target_system/
          // target_component:uint8 - confirmed via ParamRequestRead.FIELDS, not assumed).
          const nameBytes = bytes.slice(14, 14 + 16);
          const nullIndex = nameBytes.indexOf(0);
          return String.fromCharCode(...nameBytes.slice(0, nullIndex === -1 ? undefined : nullIndex));
        }),
      );
      expect(requestedNames.has("SERVO1_FUNCTION")).toBe(true);
      expect(requestedNames.has("SERVO16_TRIM")).toBe(true);
    });

    it("lists an active channel's function label and live output once params and SERVO_OUTPUT_RAW arrive", async () => {
      const sampleXml = `<?xml version="1.0"?><paramfile><vehicles><parameters name="ArduPlane">
        <param humanName="Servo output function" name="ArduPlane:SERVO1_FUNCTION" documentation="Function">
          <values><value code="4">Aileron</value></values>
        </param>
      </parameters></vehicles></paramfile>`;
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(sampleXml) }));

      mockBackend();
      await connectPlaneAndOpenMotors();

      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("SERVO1_FUNCTION", 4, MavParamType.INT16, 0, 1, 1) });
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("SERVO1_MIN", 1000, MavParamType.INT16, 1, 1, 2) });
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("SERVO1_MAX", 2000, MavParamType.INT16, 2, 1, 3) });
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("SERVO1_TRIM", 1500, MavParamType.INT16, 3, 1, 4) });
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("SERVO2_FUNCTION", 0, MavParamType.INT16, 4, 1, 5) });

      expect(await screen.findByText("Aileron")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument(); // channel number
      expect(screen.getByText("-")).toBeInTheDocument(); // no SERVO_OUTPUT_RAW yet
      expect(screen.getAllByRole("row")).toHaveLength(2); // header + exactly one active channel (2 is Disabled)

      await emit("mavlink-transport://data", { bytes: buildServoOutputRawBytes(0, [1500], 5) });
      expect(await screen.findByText("1500 us")).toBeInTheDocument();
    });

    it("press-and-hold sends a deflected DO_SET_SERVO on pointerdown and returns to trim on pointerup", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      await connectPlaneAndOpenMotors();

      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("SERVO1_FUNCTION", 4, MavParamType.INT16, 0, 1, 1) });
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("SERVO1_MIN", 1000, MavParamType.INT16, 1, 1, 2) });
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("SERVO1_MAX", 2000, MavParamType.INT16, 2, 1, 3) });
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("SERVO1_TRIM", 1500, MavParamType.INT16, 3, 1, 4) });
      const testButton = await screen.findByRole("button", { name: "Утримуйте для тесту" });

      fireEvent.pointerDown(testButton);
      // trim=1500, max=2000, min=1000 -> toward-max room (500) >= toward-min room (500), so it
      // deflects toward max: 1500 + 0.3*500 = 1650.
      expect(findSetServoPwm(invoked, 1)).toBe(1650);

      fireEvent.pointerUp(testButton);
      expect(findSetServoPwm(invoked, 1)).toBe(1500); // last DO_SET_SERVO(1, ...) is at trim again
    });
  });

  describe("motors & servos (Copter)", () => {
    async function connectCopterAndOpenMotors() {
      const view = getView();
      await view.clickConnect();
      await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit("mavlink-transport://data", { bytes: sampleHeartbeatBytes() }); // QUADROTOR
      await view.clickMotorsNav();
      return view;
    }

    it("shows a Load Frame Info button and not-loaded message for a connected Copter", async () => {
      mockBackend();
      await connectCopterAndOpenMotors();
      expect(screen.getByRole("button", { name: "Завантажити налаштування моторів" })).toBeInTheDocument();
      expect(screen.getByText("Клас і тип рами ще не завантажено.")).toBeInTheDocument();
    });

    it("requests FRAME_CLASS/FRAME_TYPE and SERVOx_REVERSED by name when Load Motor Setup is clicked", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectCopterAndOpenMotors();

      await user.click(screen.getByRole("button", { name: "Завантажити налаштування моторів" }));

      const requestedNames = new Set(
        invoked.mock.calls
          .filter(([cmd, payload]) => cmd === "send_bytes" && (payload as { bytes: number[] }).bytes[7] === ParamRequestRead.MSG_ID)
          .map(([, payload]) => {
            const bytes = (payload as { bytes: number[] }).bytes;
            const nameBytes = bytes.slice(14, 14 + 16);
            const nullIndex = nameBytes.indexOf(0);
            return String.fromCharCode(...nameBytes.slice(0, nullIndex === -1 ? undefined : nullIndex));
          }),
      );
      expect(requestedNames.has("FRAME_CLASS")).toBe(true);
      expect(requestedNames.has("FRAME_TYPE")).toBe(true);
      expect(requestedNames.has("SERVO1_REVERSED")).toBe(true);
      expect(requestedNames.has("SERVO16_REVERSED")).toBe(true);
    });

    it("renders the verified Quad X diagram once FRAME_CLASS/FRAME_TYPE arrive, and press-and-hold sends DO_MOTOR_TEST", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      await connectCopterAndOpenMotors();

      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("FRAME_CLASS", 1, MavParamType.INT8, 0, 2, 1) }); // Quad
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("FRAME_TYPE", 1, MavParamType.INT8, 1, 2, 2) }); // X

      const diagram = await screen.findByRole("img", { name: "Motor layout" });
      expect(diagram).toBeInTheDocument();
      // Scoped to the diagram itself - the frame class/type <select> fallback options (docs
      // haven't loaded in this test) also render a plain "1", which would otherwise collide.
      const motor1Group = within(diagram).getByText("1").closest("g")!;

      fireEvent.pointerDown(motor1Group);
      expect(findMotorTestThrottle(invoked, 1)).toBe(10);

      fireEvent.pointerUp(motor1Group);
      expect(findMotorTestThrottle(invoked, 1)).toBe(0);
    });

    it("shows a reboot-required warning and lets Frame Class/Type be changed via PARAM_SET", async () => {
      // Deliberately does NOT stub a resolving fetch here (unlike the "parameters" describe
      // block's docs tests below) - fetchParamDocs caches successful ArduCopter results at
      // module scope (in-memory + localStorage), and this file's tests share that module, so a
      // real fetch here would leak cached docs into those later tests. The file-wide beforeEach
      // already stubs fetch to reject, which exercises the raw-numeric-fallback <option> path.
      const invoked = vi.fn();
      mockBackend(invoked);
      await connectCopterAndOpenMotors();

      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("FRAME_CLASS", 1, MavParamType.INT8, 0, 2, 1) });
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("FRAME_TYPE", 1, MavParamType.INT8, 1, 2, 2) });
      await screen.findByRole("img", { name: "Motor layout" });

      expect(
        screen.getByText("Зміна класу або типу рами вимагає перезавантаження - вона не застосується одразу."),
      ).toBeInTheDocument();

      const frameClassSelect = screen.getByRole("combobox", { name: "Клас рами" });
      fireEvent.change(frameClassSelect, { target: { value: "1" } });

      const paramSet = invoked.mock.calls.find(
        ([cmd, payload]) => cmd === "send_bytes" && (payload as { bytes: number[] }).bytes[7] === ParamSet.MSG_ID,
      );
      expect(paramSet).toBeDefined();
    });

    it("clicking Reboot Now sends PREFLIGHT_REBOOT_SHUTDOWN(autopilot=REBOOT)", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectCopterAndOpenMotors();

      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("FRAME_CLASS", 1, MavParamType.INT8, 0, 2, 1) });
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("FRAME_TYPE", 1, MavParamType.INT8, 1, 2, 2) });
      await screen.findByRole("img", { name: "Motor layout" });

      await user.click(screen.getByRole("button", { name: "Перезавантажити зараз" }));

      const sent = findCommandLongSend(invoked, MavCmd.PREFLIGHT_REBOOT_SHUTDOWN);
      expect(sent).toBeDefined();
      const bytes = (sent![1] as { bytes: number[] }).bytes;
      const view = new DataView(new Uint8Array(bytes).buffer);
      // param1 (autopilot) is COMMAND_LONG's first float32 field - payload starts at absolute
      // byte 10 (10-byte v2 header), same base findCommandLongSend uses for `command` at 38.
      expect(view.getFloat32(10, true)).toBe(RebootShutdownAction.REBOOT);
    });

    it("toggling a motor's Reverse checkbox sends SERVOx_REVERSED via PARAM_SET", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      await connectCopterAndOpenMotors();

      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("FRAME_CLASS", 1, MavParamType.INT8, 0, 2, 1) });
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("FRAME_TYPE", 1, MavParamType.INT8, 1, 2, 2) });
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("SERVO1_REVERSED", 0, MavParamType.INT8, 2, 2, 3) });
      await screen.findByRole("img", { name: "Motor layout" });

      const checkbox = screen.getAllByRole("checkbox", { name: "Реверс" })[0]!;
      fireEvent.click(checkbox);

      const paramSet = invoked.mock.calls.find(
        ([cmd, payload]) => cmd === "send_bytes" && (payload as { bytes: number[] }).bytes[7] === ParamSet.MSG_ID,
      );
      expect(paramSet).toBeDefined();
      const bytes = (paramSet![1] as { bytes: number[] }).bytes;
      // param_id: char[16] at payload offset 6 (after paramValue:float32, targetSystem/
      // targetComponent:uint8), absolute byte 16 given the 10-byte v2 header.
      const nameBytes = bytes.slice(16, 16 + 16);
      const nullIndex = nameBytes.indexOf(0);
      expect(String.fromCharCode(...nameBytes.slice(0, nullIndex === -1 ? undefined : nullIndex))).toBe("SERVO1_REVERSED");
    });

    it("falls back to a plain per-motor list (with live PWM) for an unverified frame class/type", async () => {
      mockBackend();
      await connectCopterAndOpenMotors();

      // Tri (class 7) has no verified position/rotation diagram, but its motor count (3) is
      // still known - see motorCountForFrameClass in frameDiagrams.ts.
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("FRAME_CLASS", 7, MavParamType.INT8, 0, 2, 1) });
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("FRAME_TYPE", 0, MavParamType.INT8, 1, 2, 2) });

      expect(
        await screen.findByText(
          "Немає перевіреної схеми моторів для цього поєднання класу/типу рами - розташування треба звірити з офіційною документацією ArduPilot.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Утримуйте для тесту 1/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Утримуйте для тесту 3/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Утримуйте для тесту 4/ })).not.toBeInTheDocument();
    });
  });

  describe("PID tune (Copter)", () => {
    async function connectCopterAndOpenPidTune() {
      const view = getView();
      await view.clickConnect();
      await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit("mavlink-transport://data", { bytes: sampleHeartbeatBytes() }); // QUADROTOR
      await view.user.click(view.getPidTuneNavButton());
      return view;
    }

    it("shows a Load button and not-loaded message for a connected Copter", async () => {
      mockBackend();
      await connectCopterAndOpenPidTune();
      expect(screen.getByRole("button", { name: "Завантажити параметри PID" })).toBeInTheDocument();
      expect(screen.getByText("Параметри PID ще не завантажено.")).toBeInTheDocument();
    });

    it("requests every ATC_RAT_*/ATC_ANG_* candidate by name when Load is clicked", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectCopterAndOpenPidTune();

      await user.click(screen.getByRole("button", { name: "Завантажити параметри PID" }));

      const requestedNames = new Set(
        invoked.mock.calls
          .filter(([cmd, payload]) => cmd === "send_bytes" && (payload as { bytes: number[] }).bytes[7] === ParamRequestRead.MSG_ID)
          .map(([, payload]) => {
            const bytes = (payload as { bytes: number[] }).bytes;
            const nameBytes = bytes.slice(14, 14 + 16);
            const nullIndex = nameBytes.indexOf(0);
            return String.fromCharCode(...nameBytes.slice(0, nullIndex === -1 ? undefined : nullIndex));
          }),
      );
      expect(requestedNames.has("ATC_RAT_RLL_P")).toBe(true);
      expect(requestedNames.has("ATC_RAT_PIT_FF")).toBe(true);
      expect(requestedNames.has("ATC_RAT_YAW_D")).toBe(true);
      expect(requestedNames.has("ATC_ANG_YAW_P")).toBe(true);
    });

    it("shows gain values once they arrive, stages an edit, and Save all sends PARAM_SET with the new value", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectCopterAndOpenPidTune();

      // 0.125 and 0.25 are exactly representable in float32 - unlike e.g. 0.135 or 0.18, they
      // round-trip through the REAL32 wire codec with no precision drift (see the ARSPD_RATIO
      // comment in the "parameters" describe block below for the general phenomenon), so the
      // rendered text matches these literals exactly.
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("ATC_RAT_RLL_P", 0.125, MavParamType.REAL32, 0, 1, 1) });
      expect(await screen.findByText("0.125")).toBeInTheDocument();

      await user.click(screen.getByText("0.125"));
      const input = screen.getByRole("textbox");
      await user.clear(input);
      await user.type(input, "0.25{Enter}");

      const saveAllButton = await screen.findByRole("button", { name: "Зберегти все (1)" });
      await user.click(saveAllButton);
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("ATC_RAT_RLL_P")).toBeInTheDocument();
      expect(within(dialog).getByText("0.125")).toBeInTheDocument();
      expect(within(dialog).getByText("0.25")).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "Надіслати зміни" }));

      await vi.waitFor(() => {
        const setRequest = invoked.mock.calls.find(([cmd, payload]) => {
          if (cmd !== "send_bytes") return false;
          const bytes = (payload as { bytes: number[] }).bytes;
          return bytes[7] === ParamSet.MSG_ID;
        });
        expect(setRequest).toBeDefined();
      });
    });
  });

  describe("PID tune (Plane)", () => {
    async function connectPlaneAndOpenPidTune() {
      const view = getView();
      await view.clickConnect();
      await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit("mavlink-transport://data", { bytes: samplePlaneHeartbeatBytes() });
      await view.user.click(view.getPidTuneNavButton());
      return view;
    }

    it("resolves the modern RLL_RATE_P candidate when that's the one the vehicle reports", async () => {
      mockBackend();
      await connectPlaneAndOpenPidTune();
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("RLL_RATE_P", 0.5, MavParamType.REAL32, 0, 1, 1) });
      expect(await screen.findByText("0.5")).toBeInTheDocument();
    });

    it("falls back to the legacy RLL2SRV_P candidate when that's the only one the vehicle reports", async () => {
      mockBackend();
      await connectPlaneAndOpenPidTune();
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("RLL2SRV_P", 0.75, MavParamType.REAL32, 0, 1, 1) });
      expect(await screen.findByText("0.75")).toBeInTheDocument();
    });

    it("shows the yaw damper's Damp/Int/Slip gains, which have no P/I/D naming", async () => {
      mockBackend();
      await connectPlaneAndOpenPidTune();
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("YAW2SRV_DAMP", 0.5, MavParamType.REAL32, 0, 3, 1) });
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("YAW2SRV_INT", 0.125, MavParamType.REAL32, 1, 3, 2) });
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("YAW2SRV_SLIP", 0.25, MavParamType.REAL32, 2, 3, 3) });
      expect(await screen.findByText("0.5")).toBeInTheDocument();
      expect(screen.getByText("0.125")).toBeInTheDocument();
      expect(screen.getByText("0.25")).toBeInTheDocument();
    });
  });

  describe("ESC calibration", () => {
    async function connectAndOpenEscCal() {
      const view = getView();
      await view.clickConnect();
      await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit("mavlink-transport://data", { bytes: sampleHeartbeatBytes() });
      await view.user.click(screen.getByRole("tab", { name: "Калібрування ESC" }));
      return view;
    }

    it("shows the safety warning and Start button", async () => {
      mockBackend();
      await connectAndOpenEscCal();
      expect(screen.getByText("Зніміть усі гвинти перед калібруванням ESC.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Почати калібрування ESC" })).toBeInTheDocument();
    });

    it("sends PARAM_SET(ESC_CALIBRATION=3) then PREFLIGHT_REBOOT_SHUTDOWN when Start is clicked", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenEscCal();

      await user.click(screen.getByRole("button", { name: "Почати калібрування ESC" }));

      const paramSet = invoked.mock.calls.find(
        ([cmd, payload]) => cmd === "send_bytes" && (payload as { bytes: number[] }).bytes[7] === ParamSet.MSG_ID,
      );
      expect(paramSet).toBeDefined();
      const rebootSent = findCommandLongSend(invoked, MavCmd.PREFLIGHT_REBOOT_SHUTDOWN);
      expect(rebootSent).toBeDefined();
      expect(screen.getByText(/Команду калібрування надіслано/)).toBeInTheDocument();
    });
  });

  describe("battery config", () => {
    async function connectAndOpenBatteryConfig() {
      const view = getView();
      await view.clickConnect();
      await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit("mavlink-transport://data", { bytes: sampleHeartbeatBytes() });
      await view.user.click(screen.getByRole("tab", { name: "Налаштування батареї" }));
      return view;
    }

    it("shows a Load button and not-loaded message, and live battery telemetry when available", async () => {
      mockBackend();
      await connectAndOpenBatteryConfig();
      expect(screen.getByRole("button", { name: "Завантажити налаштування батареї" })).toBeInTheDocument();
      expect(screen.getByText("Налаштування батареї ще не завантажено.")).toBeInTheDocument();

      const sys = new SysStatus();
      sys.voltageBattery = 16800;
      sys.currentBattery = 520;
      sys.batteryRemaining = 77;
      await emit("mavlink-transport://data", { bytes: Array.from(encodePacket(sys, { seq: 1, sysid: 1, compid: 1 })) });
      expect(await screen.findByText("16.80 V")).toBeInTheDocument();
    });

    it("requests every BATT_* param by name when Load is clicked", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenBatteryConfig();

      await user.click(screen.getByRole("button", { name: "Завантажити налаштування батареї" }));

      const requestedNames = new Set(
        invoked.mock.calls
          .filter(([cmd, payload]) => cmd === "send_bytes" && (payload as { bytes: number[] }).bytes[7] === ParamRequestRead.MSG_ID)
          .map(([, payload]) => {
            const bytes = (payload as { bytes: number[] }).bytes;
            const nameBytes = bytes.slice(14, 14 + 16);
            const nullIndex = nameBytes.indexOf(0);
            return String.fromCharCode(...nameBytes.slice(0, nullIndex === -1 ? undefined : nullIndex));
          }),
      );
      expect(requestedNames.has("BATT_MONITOR")).toBe(true);
      expect(requestedNames.has("BATT_CAPACITY")).toBe(true);
      expect(requestedNames.has("BATT_FS_CRT_ACT")).toBe(true);
    });

    it("shows BATT_CAPACITY once it arrives, stages an edit, and Save all sends PARAM_SET with the new value", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenBatteryConfig();

      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("BATT_CAPACITY", 5000, MavParamType.INT32, 0, 1, 1) });
      expect(await screen.findByText("5000")).toBeInTheDocument();

      await user.click(screen.getByText("5000"));
      const input = screen.getByRole("textbox");
      await user.clear(input);
      await user.type(input, "6000{Enter}");

      const saveAllButton = await screen.findByRole("button", { name: "Зберегти все (1)" });
      await user.click(saveAllButton);
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("BATT_CAPACITY")).toBeInTheDocument();
      expect(within(dialog).getByText("5000")).toBeInTheDocument();
      expect(within(dialog).getByText("6000")).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "Надіслати зміни" }));

      await vi.waitFor(() => {
        const setRequest = invoked.mock.calls.find(([cmd, payload]) => {
          if (cmd !== "send_bytes") return false;
          const bytes = (payload as { bytes: number[] }).bytes;
          return bytes[7] === ParamSet.MSG_ID;
        });
        expect(setRequest).toBeDefined();
      });
    });
  });

  describe("Dev Mode frame-preset selector", () => {
    it("starts the simulated Copter seeded with whichever verified frame preset is selected, not just the Quad X default", async () => {
      mockBackend();
      const { user, clickDevModeCopter, clickMotorsNav, getDevFramePresetSelect, getStatusAlert } = getView();

      const presetSelect = getDevFramePresetSelect() as HTMLSelectElement;
      fireEvent.change(presetSelect, { target: { value: "3_1" } }); // Octa X (8 motors)

      await clickDevModeCopter();
      await within(getStatusAlert()).findByText("Підключено: Dev mode (simulated vehicle)");
      await clickMotorsNav();
      await user.click(screen.getByRole("button", { name: "Завантажити налаштування моторів" }));

      const diagram = await screen.findByRole("img", { name: "Motor layout" });
      // Octa X has 8 motors - the default Quad X preset would only render 4, so this also
      // proves the selector actually changed what the simulator seeded, not just the label.
      expect(within(diagram).getAllByText(/^[1-8]$/)).toHaveLength(8);

      const frameClassSelect = screen.getByRole<HTMLSelectElement>("combobox", { name: "Клас рами" });
      const frameTypeSelect = screen.getByRole<HTMLSelectElement>("combobox", { name: "Тип рами" });
      expect(frameClassSelect.value).toBe("3"); // Octa
      expect(frameTypeSelect.value).toBe("1"); // X
    });
  });

  describe("browser build (no Tauri runtime)", () => {
    it("hides live vehicle connect controls but keeps Dev Mode available", () => {
      // The file-wide beforeEach's mockWindows("main") simulates a Tauri desktop runtime -
      // undo that here to exercise what a plain browser tab (run-web) actually sees.
      Reflect.deleteProperty(window, "__TAURI_INTERNALS__");

      const { getDevModeButton, getDevModeCopterButton } = getView();

      expect(screen.queryByRole("button", { name: "USB / Серійний порт" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "UDP (WiFi / SITL)" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Підключити" })).not.toBeInTheDocument();
      expect(
        screen.getByText(/Підключення до реального апарата.*потребує десктоп-застосунку/),
      ).toBeInTheDocument();

      expect(getDevModeButton()).toBeInTheDocument();
      expect(getDevModeCopterButton()).toBeInTheDocument();
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

    it("shows a visual progress bar while loading, reflecting received/expected, and hides it once complete", async () => {
      mockBackend();
      const { user } = await connectWithVehicle();
      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));

      await emit("mavlink-transport://data", {
        bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 2, 1),
      });
      await screen.findByText("ARSPD_USE");

      const bar = screen.getByTestId("param-load-progress");
      expect(bar.firstElementChild).toHaveStyle({ width: "50%" });

      await emit("mavlink-transport://data", {
        bytes: buildParamValueBytes("ARSPD_RATIO", 2, MavParamType.INT8, 1, 2, 2),
      });
      await screen.findByText("ARSPD_RATIO");

      // Now received (2) >= expected (2) - the bar disappears rather than sitting at 100%
      // forever, since the load is done.
      expect(screen.queryByTestId("param-load-progress")).not.toBeInTheDocument();
    });

    it("Save to file exports every loaded parameter as NAME,VALUE", async () => {
      mockBackend();
      const { user } = await connectWithVehicle();
      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 2, 1) });
      await emit("mavlink-transport://data", {
        bytes: buildParamValueBytes("ARSPD_RATIO", 1.98, MavParamType.REAL32, 1, 2, 2),
      });
      await screen.findByText("ARSPD_RATIO");

      let capturedBlob: Blob | undefined;
      URL.createObjectURL = vi.fn((blob) => {
        capturedBlob = blob as Blob;
        return "blob:mock-url";
      });
      URL.revokeObjectURL = vi.fn();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      await user.click(screen.getByRole("button", { name: "Зберегти у файл" }));

      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(capturedBlob).toBeDefined();
      const text = await capturedBlob!.text();
      expect(text).toContain("ARSPD_USE,1");
      expect(text).toContain("ARSPD_RATIO,1.98");

      clickSpy.mockRestore();
    });

    it("Load from file stages only known, changed parameters into the same Save-all flow as manual edits", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectWithVehicle();
      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));
      await emit("mavlink-transport://data", { bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 2, 1) });
      await emit("mavlink-transport://data", {
        bytes: buildParamValueBytes("ARSPD_RATIO", 1.98, MavParamType.REAL32, 1, 2, 2),
      });
      await screen.findByText("ARSPD_RATIO");

      // ARSPD_USE really changes (1 -> 0); ARSPD_RATIO is written back with its exact stored
      // value (REAL32 decodes 1.98 to 1.9800000190734863, the classic float32-promoted-to-
      // double artifact - a real Save-to-file export would write this same full-precision
      // value, so matching it exactly here is what a genuine save/reload round trip looks
      // like) so it shouldn't be staged; UNKNOWN_PARAM isn't a param this vehicle reported, so
      // its type is unknown and it can't be safely written - also skipped.
      const fileContent = "# comment line, ignored\nARSPD_USE,0\nARSPD_RATIO,1.9800000190734863\nUNKNOWN_PARAM,5\n";
      const file = new File([fileContent], "backup.param", { type: "text/plain" });
      const fileInput = screen.getByTestId("param-file-input");

      invoked.mockClear();
      await user.upload(fileInput, file);

      const saveAllButton = await screen.findByRole("button", { name: "Зберегти все (1)" });
      await user.click(saveAllButton);
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("ARSPD_USE")).toBeInTheDocument();
      expect(within(dialog).queryByText("ARSPD_RATIO")).not.toBeInTheDocument();
      expect(within(dialog).queryByText("UNKNOWN_PARAM")).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "Надіслати зміни" }));

      await vi.waitFor(() => {
        const setRequest = invoked.mock.calls.find(([cmd, payload]) => {
          if (cmd !== "send_bytes") return false;
          const bytes = (payload as { bytes: number[] }).bytes;
          return bytes[7] === ParamSet.MSG_ID;
        });
        expect(setRequest).toBeDefined();
      });
    });

    it("orders the table columns as Name, Value, Description", async () => {
      mockBackend();
      const { user } = await connectWithVehicle();
      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));
      await emit("mavlink-transport://data", {
        bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 1, 1),
      });
      await screen.findByText("ARSPD_USE");

      const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
      expect(headers).toEqual(["Назва", "Значення", "Опис"]);
    });

    it("batches a fast burst of PARAM_VALUE packets into the table instead of showing them one at a time", async () => {
      // Regression test for a real freeze: a full parameter list arrives as hundreds of
      // PARAM_VALUE packets in quick succession, which used to trigger one store update (and
      // one full-table re-render) per packet. Emitting a burst here and asserting they all
      // land correctly exercises the buffered/batched flush (PARAM_FLUSH_INTERVAL_MS) instead.
      mockBackend();
      const { user } = await connectWithVehicle();
      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));

      const names = ["ARSPD_USE", "ARSPD_RATIO", "ARSPD_FBW_MIN", "ARSPD_FBW_MAX", "ARSPD_OFFSET"];
      for (const [i, name] of names.entries()) {
        await emit("mavlink-transport://data", {
          bytes: buildParamValueBytes(name, i, MavParamType.INT8, i, names.length, i + 1),
        });
      }

      for (const name of names) {
        expect(await screen.findByText(name)).toBeInTheDocument();
      }
      expect(screen.getByText(`Отримано ${names.length} / ${names.length}`)).toBeInTheDocument();
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
      // Checks specifically for the absence of a PARAM_SET, not of any send_bytes call at
      // all - the connected session's periodic 1Hz GCS heartbeat legitimately calls
      // send_bytes on its own timer, making a "no send_bytes at all" check flaky under load
      // (see the same fix applied to the "stages an edit locally..." test above).
      const sentParamSet = invoked.mock.calls.some(([cmd, payload]) => {
        if (cmd !== "send_bytes") return false;
        const bytes = (payload as { bytes: number[] }).bytes;
        return bytes[7] === ParamSet.MSG_ID;
      });
      expect(sentParamSet).toBe(false);
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

  describe("compass calibration", () => {
    async function connectAndOpenCompassCal() {
      const view = getView();
      await view.clickConnect();
      await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit("mavlink-transport://data", { bytes: sampleHeartbeatBytes() });
      await view.clickCompassCalNav();
      return view;
    }

    it("shows a not-started placeholder before calibration begins", async () => {
      mockBackend();
      await connectAndOpenCompassCal();
      expect(screen.getByText("Калібрування ще не розпочато.")).toBeInTheDocument();
    });

    it("sends DO_START_MAG_CAL when Start Calibration is clicked", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenCompassCal();

      await user.click(screen.getByRole("button", { name: "Почати калібрування" }));

      await vi.waitFor(() => {
        expect(findCommandLongSend(invoked, MavCmd.DO_START_MAG_CAL)).toBeDefined();
      });
    });

    it("shows per-compass status and coverage percentage as MAG_CAL_PROGRESS arrives", async () => {
      mockBackend();
      const { user } = await connectAndOpenCompassCal();
      await user.click(screen.getByRole("button", { name: "Почати калібрування" }));

      await emit("mavlink-transport://data", {
        bytes: buildMagCalProgressBytes(0, MagCalStatus.RUNNING_STEP_ONE, 37, new Array<number>(10).fill(0), 1),
      });

      expect(await screen.findByText("Компас 0")).toBeInTheDocument();
      expect(screen.getByText("Калібрування (крок 1)")).toBeInTheDocument();
      expect(screen.getByText("37%")).toBeInTheDocument();
    });

    it("shows Accept once a compass reports SUCCESS, and sends DO_ACCEPT_MAG_CAL when clicked", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenCompassCal();
      await user.click(screen.getByRole("button", { name: "Почати калібрування" }));
      await emit("mavlink-transport://data", {
        bytes: buildMagCalReportBytes(0, MagCalStatus.SUCCESS, 12.3, 1),
      });
      await screen.findByText("Компас 0");

      await user.click(screen.getByRole("button", { name: "Прийняти й зберегти" }));

      await vi.waitFor(() => {
        expect(findCommandLongSend(invoked, MavCmd.DO_ACCEPT_MAG_CAL)).toBeDefined();
      });
      expect(await screen.findByText("Калібрування прийнято - зміщення збережено на апараті.")).toBeInTheDocument();
    });

    it("sends DO_CANCEL_MAG_CAL when Cancel is clicked mid-calibration", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenCompassCal();
      await user.click(screen.getByRole("button", { name: "Почати калібрування" }));
      await emit("mavlink-transport://data", {
        bytes: buildMagCalProgressBytes(0, MagCalStatus.RUNNING_STEP_ONE, 10, new Array<number>(10).fill(0), 1),
      });
      await screen.findByText("Компас 0");

      await user.click(screen.getByRole("button", { name: "Скасувати" }));

      await vi.waitFor(() => {
        expect(findCommandLongSend(invoked, MavCmd.DO_CANCEL_MAG_CAL)).toBeDefined();
      });
    });

    it("shows a rejection alert when the vehicle NACKs DO_START_MAG_CAL", async () => {
      mockBackend();
      const { user } = await connectAndOpenCompassCal();
      await user.click(screen.getByRole("button", { name: "Почати калібрування" }));

      await emit("mavlink-transport://data", {
        bytes: buildCommandAckBytes(MavCmd.DO_START_MAG_CAL, MavResult.DENIED, 1),
      });

      expect(await screen.findByText("Апарат відхилив команду: Відхилено")).toBeInTheDocument();
    });
  });

  describe("accelerometer calibration", () => {
    async function connectAndOpenAccelCal() {
      const view = getView();
      await view.clickConnect();
      await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit("mavlink-transport://data", { bytes: sampleHeartbeatBytes() });
      await view.clickAccelCalNav();
      return view;
    }

    it("shows a not-started placeholder before calibration begins", async () => {
      mockBackend();
      await connectAndOpenAccelCal();
      expect(screen.getByText("Калібрування ще не розпочато.")).toBeInTheDocument();
    });

    it("sends PREFLIGHT_CALIBRATION(accelerometer=TRIM) and shows success once acked, when Calibrate Level is clicked", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenAccelCal();

      await user.click(screen.getByRole("button", { name: "Калібрувати рівень" }));

      await vi.waitFor(() => {
        expect(findCommandLongSend(invoked, MavCmd.PREFLIGHT_CALIBRATION)).toBeDefined();
      });
      const sent = findCommandLongSend(invoked, MavCmd.PREFLIGHT_CALIBRATION)!;
      // accelerometer is param5 - a plain float32 at payload offset 16 (absolute byte 26).
      const bytes = (sent[1] as { bytes: number[] }).bytes;
      expect(new DataView(new Uint8Array(bytes).buffer).getFloat32(26, true)).toBe(2); // TRIM

      expect(screen.getByText("Калібрування...")).toBeInTheDocument();

      await emit("mavlink-transport://data", {
        bytes: buildCommandAckBytes(MavCmd.PREFLIGHT_CALIBRATION, MavResult.ACCEPTED, 1),
      });
      expect(await screen.findByText("Калібрування рівня завершено.")).toBeInTheDocument();

      // Regression: the Start buttons must reappear once a level cal finishes, not stay
      // hidden forever - a real bug caught by browser click-through, not by the isolated unit
      // assertions above (those never re-checked button visibility after completion).
      expect(screen.getByRole("button", { name: "Калібрувати рівень" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Повне калібрування" })).toBeInTheDocument();
    });

    it("Full Calibration steps through vehicle-requested positions, confirming echoes each one back, ending in success", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenAccelCal();

      await user.click(screen.getByRole("button", { name: "Повне калібрування" }));
      await vi.waitFor(() => {
        expect(findCommandLongSend(invoked, MavCmd.PREFLIGHT_CALIBRATION)).toBeDefined();
      });

      // Vehicle asks the user to move to LEVEL first. The position label also appears in the
      // checklist below, hence the testid - see AccelCalSection.tsx.
      await emit("mavlink-transport://data", { bytes: buildAccelcalVehiclePosBytes(AccelcalVehiclePos.LEVEL, 1) });
      expect(await screen.findByTestId("accel-cal-position-prompt")).toHaveTextContent("Рівно");

      invoked.mockClear();
      await user.click(screen.getByRole("button", { name: "Апарат у цьому положенні" }));
      // Confirming echoes the SAME position back to the vehicle.
      await vi.waitFor(() => {
        const call = findCommandLongSend(invoked, MavCmd.ACCELCAL_VEHICLE_POS);
        expect(call).toBeDefined();
        const bytes = (call![1] as { bytes: number[] }).bytes;
        expect(new DataView(new Uint8Array(bytes).buffer).getFloat32(10, true)).toBe(AccelcalVehiclePos.LEVEL);
      });

      // Vehicle moves on to LEFT.
      await emit("mavlink-transport://data", { bytes: buildAccelcalVehiclePosBytes(AccelcalVehiclePos.LEFT, 2) });
      expect(await screen.findByTestId("accel-cal-position-prompt")).toHaveTextContent("На лівому боці");
      expect(screen.getByTestId(`accel-cal-checklist-${AccelcalVehiclePos.LEVEL}`).className).toContain("border-primary"); // LEVEL now checked off

      // Vehicle reports overall success (a real full cal steps through all 6 - shortcutting the
      // remaining 4 here since the position-request/confirm-echo mechanics are already proven).
      await emit("mavlink-transport://data", { bytes: buildAccelcalVehiclePosBytes(AccelcalVehiclePos.SUCCESS, 3) });
      expect(await screen.findByText("Калібрування успішне.")).toBeInTheDocument();
    });

    it("shows a rejection alert when the vehicle NACKs PREFLIGHT_CALIBRATION", async () => {
      mockBackend();
      const { user } = await connectAndOpenAccelCal();
      await user.click(screen.getByRole("button", { name: "Повне калібрування" }));

      await emit("mavlink-transport://data", {
        bytes: buildCommandAckBytes(MavCmd.PREFLIGHT_CALIBRATION, MavResult.DENIED, 1),
      });

      expect(await screen.findByText("Апарат відхилив команду: Відхилено")).toBeInTheDocument();
    });
  });

  describe("RC calibration", () => {
    async function connectAndOpenRcCal() {
      const view = getView();
      await view.clickConnect();
      await emit("mavlink-transport://status", { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit("mavlink-transport://data", { bytes: sampleHeartbeatBytes() });
      await view.clickRcCalNav();
      return view;
    }

    it("shows a no-signal message before any RC_CHANNELS arrives", async () => {
      mockBackend();
      await connectAndOpenRcCal();
      expect(screen.getByText("Сигнал RC ще не отримано - перевірте передавач і приймач.")).toBeInTheDocument();
    });

    it("sends PREFLIGHT_CALIBRATION(remoteControl=1) when Start is clicked, and expands min/max as further RC_CHANNELS arrive", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenRcCal();

      await emit("mavlink-transport://data", { bytes: buildRcChannelsBytes({ 1: 1500, 3: 1000 }, 8, 1) });
      expect(await screen.findByText("1500")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Почати калібрування" }));
      await vi.waitFor(() => {
        expect(findCommandLongSend(invoked, MavCmd.PREFLIGHT_CALIBRATION)).toBeDefined();
      });
      const sent = findCommandLongSend(invoked, MavCmd.PREFLIGHT_CALIBRATION)!;
      // remoteControl is param4 - a plain float32 at payload offset 12 (absolute byte 22).
      const bytes = (sent[1] as { bytes: number[] }).bytes;
      expect(new DataView(new Uint8Array(bytes).buffer).getFloat32(22, true)).toBe(1);

      // The first packet after Start seeds min=max=trim=1500; a lower value afterwards should
      // expand min without moving trim.
      await emit("mavlink-transport://data", { bytes: buildRcChannelsBytes({ 1: 1500, 3: 1000 }, 8, 2) });
      await emit("mavlink-transport://data", { bytes: buildRcChannelsBytes({ 1: 1000, 3: 1000 }, 8, 3) });
      await emit("mavlink-transport://data", { bytes: buildRcChannelsBytes({ 1: 2000, 3: 1000 }, 8, 4) });

      expect(await screen.findByText("2000")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Зберегти" })).toBeInTheDocument();
    });

    it("Save writes RC{ch}_MIN/MAX/TRIM/REVERSED via PARAM_SET for every captured channel and sends PREFLIGHT_CALIBRATION(remoteControl=0)", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenRcCal();

      await user.click(screen.getByRole("button", { name: "Почати калібрування" }));
      await emit("mavlink-transport://data", { bytes: buildRcChannelsBytes({ 1: 1500 }, 8, 1) });
      await emit("mavlink-transport://data", { bytes: buildRcChannelsBytes({ 1: 1000 }, 8, 2) });
      await emit("mavlink-transport://data", { bytes: buildRcChannelsBytes({ 1: 2000 }, 8, 3) });
      await screen.findByText("2000");

      const reverseCheckbox = screen.getByRole("checkbox", { name: "Реверс" });
      await user.click(reverseCheckbox);

      invoked.mockClear();
      await user.click(screen.getByRole("button", { name: "Зберегти" }));

      const paramSets = invoked.mock.calls.filter(
        ([cmd, payload]) => cmd === "send_bytes" && (payload as { bytes: number[] }).bytes[7] === ParamSet.MSG_ID,
      );
      function paramName(bytes: number[]): string {
        // param_id: char[16] at payload offset 6 (after paramValue:float32, targetSystem/
        // targetComponent:uint8), absolute byte 16 given the 10-byte v2 header.
        const nameBytes = bytes.slice(16, 16 + 16);
        const nullIndex = nameBytes.indexOf(0);
        return String.fromCharCode(...nameBytes.slice(0, nullIndex === -1 ? undefined : nullIndex));
      }
      const names = paramSets.map(([, payload]) => paramName((payload as { bytes: number[] }).bytes));
      expect(names).toEqual(
        expect.arrayContaining(["RC1_MIN", "RC1_MAX", "RC1_TRIM", "RC1_REVERSED"]),
      );
      const reversedSet = paramSets.find(([, payload]) => paramName((payload as { bytes: number[] }).bytes) === "RC1_REVERSED")!;
      const reversedBytes = (reversedSet[1] as { bytes: number[] }).bytes;
      const reversedPayload = new Uint8Array(reversedBytes.slice(10)); // 10-byte v2 header
      expect(paramWireBitsToValue(readParamValueBits(reversedPayload), MavParamType.INT8)).toBe(1);

      expect(findCommandLongSend(invoked, MavCmd.PREFLIGHT_CALIBRATION)).toBeDefined();
      // Back to the not-started view - Start Calibration is available again, Save/Cancel gone.
      expect(await screen.findByRole("button", { name: "Почати калібрування" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Зберегти" })).not.toBeInTheDocument();
    });

    it("Cancel sends PREFLIGHT_CALIBRATION(remoteControl=0) without writing any params", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenRcCal();

      await user.click(screen.getByRole("button", { name: "Почати калібрування" }));
      await emit("mavlink-transport://data", { bytes: buildRcChannelsBytes({ 1: 1500 }, 8, 1) });
      await screen.findByText("1500");

      invoked.mockClear();
      await user.click(screen.getByRole("button", { name: "Скасувати" }));

      const paramSets = invoked.mock.calls.filter(
        ([cmd, payload]) => cmd === "send_bytes" && (payload as { bytes: number[] }).bytes[7] === ParamSet.MSG_ID,
      );
      expect(paramSets).toHaveLength(0);
      const sent = findCommandLongSend(invoked, MavCmd.PREFLIGHT_CALIBRATION)!;
      const bytes = (sent[1] as { bytes: number[] }).bytes;
      expect(new DataView(new Uint8Array(bytes).buffer).getFloat32(22, true)).toBe(0);
      expect(await screen.findByRole("button", { name: "Почати калібрування" })).toBeInTheDocument();
    });

    it("shows an armed-rejection alert on a FAILED ack, but treats the normal UNSUPPORTED ack as success (real ArduPilot quirk)", async () => {
      mockBackend();
      const { user } = await connectAndOpenRcCal();
      await user.click(screen.getByRole("button", { name: "Почати калібрування" }));

      await emit("mavlink-transport://data", {
        bytes: buildCommandAckBytes(MavCmd.PREFLIGHT_CALIBRATION, MavResult.UNSUPPORTED, 1),
      });
      expect(screen.queryByText("Апарат озброєний - роззбройте перед калібруванням.")).not.toBeInTheDocument();

      await emit("mavlink-transport://data", {
        bytes: buildCommandAckBytes(MavCmd.PREFLIGHT_CALIBRATION, MavResult.FAILED, 2),
      });
      expect(await screen.findByText("Апарат озброєний - роззбройте перед калібруванням.")).toBeInTheDocument();
    });
  });
});
