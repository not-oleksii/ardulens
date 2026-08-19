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
  MavSeverity,
  MavState,
  MavSysStatusSensor,
  MavType,
  ParamRequestList,
  ParamRequestRead,
  ParamSet,
  ParamValue,
  RcChannels,
  RebootShutdownAction,
  RequestDataStream,
  ServoOutputRaw,
  StatusText,
  SysStatus,
  VfrHud,
} from "../../../mavlink/registry/registry";
import { PFD_TEST_IDS } from "../../../components/PrimaryFlightDisplay/pfdTestIds";
import { DATA_EVENT, STATUS_EVENT } from "../../../services/mavlinkTransport/mavlinkTransport";
import { useMavlinkAccelCalStore } from "../../../stores/mavlinkAccelCalStore/mavlinkAccelCalStore";
import { useMavlinkCompassCalStore } from "../../../stores/mavlinkCompassCalStore/mavlinkCompassCalStore";
import { useMavlinkConnectionStore } from "../../../stores/mavlinkConnectionStore/mavlinkConnectionStore";
import { useMavlinkParamDefaultsStore } from "../../../stores/mavlinkParamDefaultsStore/mavlinkParamDefaultsStore";
import { useMavlinkParameterStore } from "../../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { useMavlinkRcCalStore } from "../../../stores/mavlinkRcCalStore/mavlinkRcCalStore";
import { useMavlinkStatusTextStore } from "../../../stores/mavlinkStatusTextStore/mavlinkStatusTextStore";
import { useMavlinkTelemetryStore } from "../../../stores/mavlinkTelemetryStore/mavlinkTelemetryStore";
import { useMavlinkVehicleStore } from "../../../stores/mavlinkVehicleStore/mavlinkVehicleStore";
import { useFileStore } from "../../../stores/fileStore/fileStore";
import { useUiStore } from "../../../stores/uiStore/uiStore";
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

function buildHeartbeatBytes(type: MavType): number[] {
  const hb = new Heartbeat();
  hb.type = type;
  hb.autopilot = MavAutopilot.ARDUPILOTMEGA;
  hb.baseMode = MavModeFlag.STABILIZE_ENABLED;
  hb.customMode = 0;
  hb.systemStatus = MavState.STANDBY;
  hb.mavlinkVersion = 3;
  return Array.from(encodePacket(hb, { seq: 1, sysid: 1, compid: 1 }));
}

function sampleHeartbeatBytes(): number[] {
  return buildHeartbeatBytes(MavType.QUADROTOR);
}

function samplePlaneHeartbeatBytes(): number[] {
  return buildHeartbeatBytes(MavType.FIXED_WING);
}

function sampleRoverHeartbeatBytes(): number[] {
  return buildHeartbeatBytes(MavType.GROUND_ROVER);
}

function sampleSubHeartbeatBytes(): number[] {
  return buildHeartbeatBytes(MavType.SUBMARINE);
}

function sampleTrackerHeartbeatBytes(): number[] {
  return buildHeartbeatBytes(MavType.ANTENNA_TRACKER);
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
  const getRcSetupNavButton = () => screen.getByRole("tab", { name: "Налаштування RC" });
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
  const clickRcSetupNav = () => user.click(getRcSetupNavButton());
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
    getRcSetupNavButton,
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
    clickRcSetupNav,
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
  useMavlinkStatusTextStore.getState().reset();
  useMavlinkParameterStore.getState().reset();
  useMavlinkCompassCalStore.getState().reset();
  useMavlinkAccelCalStore.getState().reset();
  useMavlinkRcCalStore.getState().reset();
  useMavlinkParamDefaultsStore.getState().reset();
  useFileStore.getState().clearFile();
  useUiStore.getState().setPendingPresetKey(null);
  useUiStore.getState().setActiveTab("logs");
  localStorage.clear();
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

  describe("onboarding nudge", () => {
    it("shows a suggested setup order on first connection, and navigates when a step is clicked", async () => {
      const { clickDevMode, getStatusAlert, user } = getView();
      await clickDevMode();
      await within(getStatusAlert()).findByText("Підключено: Dev mode (simulated vehicle)");

      expect(await screen.findByText("Новий апарат?")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Калібрування акселерометра/ }));

      expect(await screen.findByText("Калібрування ще не розпочато.")).toBeInTheDocument();
    });

    it("dismissing hides it, and it stays hidden across a reconnect", async () => {
      const { clickDevMode, clickDisconnect, getStatusAlert, user } = getView();
      await clickDevMode();
      await within(getStatusAlert()).findByText("Підключено: Dev mode (simulated vehicle)");
      await user.click(screen.getByRole("button", { name: "Закрити" }));
      expect(screen.queryByText("Новий апарат?")).not.toBeInTheDocument();

      await clickDisconnect();
      await clickDevMode();
      await within(getStatusAlert()).findByText("Підключено: Dev mode (simulated vehicle)");

      expect(screen.queryByText("Новий апарат?")).not.toBeInTheDocument();
    });
  });

  describe("arm/disarm and mode switching", () => {
    it("sends COMPONENT_ARM_DISARM when arming is confirmed, and the badge flips once the vehicle acks and reports armed", async () => {
      const { clickDevMode, getStatusAlert, user } = getView();
      await clickDevMode();
      await within(getStatusAlert()).findByText("Підключено: Dev mode (simulated vehicle)");

      await user.click(screen.getByRole("button", { name: "Озброїти" }));
      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Озброїти" }));

      expect(await screen.findByRole("button", { name: "Роззброїти" })).toBeInTheDocument();
    });

    it("cancelling the confirmation sends nothing and leaves the vehicle disarmed", async () => {
      const { clickDevMode, getStatusAlert, user } = getView();
      await clickDevMode();
      await within(getStatusAlert()).findByText("Підключено: Dev mode (simulated vehicle)");

      await user.click(screen.getByRole("button", { name: "Озброїти" }));
      await user.click(screen.getByRole("button", { name: "Скасувати" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Озброїти" })).toBeInTheDocument();
    });

    it(
      "disarming needs no confirmation, and the badge flips back once the vehicle acks",
      async () => {
        const { clickDevMode, getStatusAlert, user } = getView();
        await clickDevMode();
        await within(getStatusAlert()).findByText("Підключено: Dev mode (simulated vehicle)");
        await user.click(screen.getByRole("button", { name: "Озброїти" }));
        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Озброїти" }));
        await screen.findByRole("button", { name: "Роззброїти" }, { timeout: 15000 });

        await user.click(screen.getByRole("button", { name: "Роззброїти" }));

        expect(await screen.findByRole("button", { name: "Озброїти" }, { timeout: 15000 })).toBeInTheDocument();
      },
      20000,
    );

    it("changing the flight mode via the dropdown is reflected once the vehicle's next heartbeat arrives", async () => {
      const { clickDevMode, getStatusAlert, user } = getView(); // Dev Mode simulates a Plane by default
      await clickDevMode();
      await within(getStatusAlert()).findByText("Підключено: Dev mode (simulated vehicle)");

      const select = await screen.findByLabelText("Режим");
      await user.selectOptions(select, "11"); // RTL

      // A real round trip, not just the browser's own optimistic selection: this is a
      // controlled <select> bound to vehicle.customMode, so it only settles on "11" once the
      // mock vehicle has actually received SET_MODE and reported the change back on its next
      // heartbeat - if that round trip were broken, React would just snap it back to the old
      // value on the next render instead.
      await vi.waitFor(() => expect(select).toHaveValue("11"));
    });
  });

  describe("vehicle health (sensor status + STATUSTEXT)", () => {
    function buildSysStatus(present: number, health: number) {
      const sys = new SysStatus();
      sys.voltageBattery = 16800;
      sys.currentBattery = -1;
      sys.batteryRemaining = -1;
      sys.onboardControlSensorsPresent = present;
      sys.onboardControlSensorsEnabled = present;
      sys.onboardControlSensorsHealth = health;
      return sys;
    }

    // The two SYS_STATUS tests below deliberately connect via the manual clickConnect() flow,
    // not Dev Mode - Dev Mode's own mock vehicle streams a real, continuously-repeating
    // SYS_STATUS every 250ms (see mockVehicleSimulator.ts's SIMULATED_SENSOR_HEALTH, always
    // fully healthy) once telemetry starts, which would otherwise race against and overwrite
    // the single hand-crafted (un)healthy packet each of these tests sends. The manual flow has
    // no such background stream, so only the packet the test itself sends ever arrives.
    async function connectAndOpenTelemetry() {
      const view = getView();
      await view.clickConnect();
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: sampleHeartbeatBytes() });
      return view;
    }

    it("shows nothing once SYS_STATUS reports every present sensor healthy - this view is failures-only", async () => {
      mockBackend();
      await connectAndOpenTelemetry();

      const present = MavSysStatusSensor.SENSOR_3D_GYRO | MavSysStatusSensor.SENSOR_GPS | MavSysStatusSensor.PREARM_CHECK;
      await emit(DATA_EVENT, { bytes: Array.from(encodePacket(buildSysStatus(present, present), { seq: 2, sysid: 1, compid: 1 })) });

      // No reliable "it arrived and was processed" signal to await for a UI that stays empty -
      // a short real wait is the only option here (see the STATUSTEXT INFO-filtering test above
      // for the same tradeoff).
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByText(/Перевірки перед зльотом/)).not.toBeInTheDocument();
      expect(screen.queryByText("Гіроскоп")).not.toBeInTheDocument();
    });

    it("flags an unhealthy present sensor and a failing pre-arm badge", async () => {
      mockBackend();
      await connectAndOpenTelemetry();

      const present = MavSysStatusSensor.SENSOR_3D_GYRO | MavSysStatusSensor.PREARM_CHECK;
      // Both present, neither healthy - health=0 for both bits.
      await emit(DATA_EVENT, { bytes: Array.from(encodePacket(buildSysStatus(present, 0), { seq: 2, sysid: 1, compid: 1 })) });

      expect(await screen.findByText("Перевірки перед зльотом не пройдено")).toBeInTheDocument();
      expect(screen.getByText("Гіроскоп")).toBeInTheDocument();
    });

    it("shows recent STATUSTEXT failure messages (WARNING or worse), most recent first", async () => {
      mockBackend();
      const { clickDevMode, getStatusAlert } = getView();
      await clickDevMode();
      await within(getStatusAlert()).findByText("Підключено: Dev mode (simulated vehicle)");

      function buildStatusText(severity: MavSeverity, text: string) {
        const msg = new StatusText();
        msg.severity = severity;
        msg.text = text;
        msg.id = 0;
        msg.chunkSeq = 0;
        return msg;
      }

      await emit(DATA_EVENT, {
        bytes: Array.from(encodePacket(buildStatusText(MavSeverity.WARNING, "PreArm: Compass not calibrated"), { seq: 1, sysid: 1, compid: 1 })),
      });
      await screen.findByText("PreArm: Compass not calibrated");
      await emit(DATA_EVENT, {
        bytes: Array.from(encodePacket(buildStatusText(MavSeverity.ERROR, "PreArm: GPS glitch"), { seq: 2, sysid: 1, compid: 1 })),
      });
      await screen.findByText("PreArm: GPS glitch");

      const messages = screen.getAllByText(/PreArm: Compass not calibrated|PreArm: GPS glitch/);
      expect(messages.map((el) => el.textContent)).toEqual(["PreArm: GPS glitch", "PreArm: Compass not calibrated"]);
    });

    it("doesn't show a routine INFO/DEBUG STATUSTEXT message - this view is failures-only", async () => {
      mockBackend();
      const { clickDevMode, getStatusAlert } = getView();
      await clickDevMode();
      await within(getStatusAlert()).findByText("Підключено: Dev mode (simulated vehicle)");

      const msg = new StatusText();
      msg.severity = MavSeverity.INFO;
      msg.text = "Ready to fly";
      msg.id = 0;
      msg.chunkSeq = 0;
      await emit(DATA_EVENT, { bytes: Array.from(encodePacket(msg, { seq: 1, sysid: 1, compid: 1 })) });

      // No reliable "it arrived" signal to await for a message we expect NOT to render - a
      // short real wait is the only option, matching this file's own established tolerance for
      // small timing waits elsewhere (see the mock heartbeat's own immediate-vs-1s-tick tests).
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByText("Ready to fly")).not.toBeInTheDocument();
    });
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

    await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });

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
    await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
    await within(getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");

    await clickDisconnect();
    await emit(STATUS_EVENT, { kind: "disconnected" });

    expect(await within(getStatusAlert()).findByText("Не підключено")).toBeInTheDocument();
    expect(getConnectButton()).toBeInTheDocument();
  });

  it("shows a destructive alert with the error message when the backend reports a connection error", async () => {
    mockBackend();
    const { clickConnect, getStatusAlert } = getView();
    await clickConnect();

    await emit(STATUS_EVENT, { kind: "error", message: "port busy" });

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

    await emit(DATA_EVENT, { bytes: [1, 2, 3] });
    await emit(DATA_EVENT, { bytes: [4, 5] });

    expect(await screen.findByText("Отримано: 5 Б")).toBeInTheDocument();
  });

  it("decodes a real HEARTBEAT pushed through the data event and shows the vehicle panel", async () => {
    mockBackend();
    const { clickConnect, getStatusAlert } = getView();
    await clickConnect();
    await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
    await within(getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");

    const hb = new Heartbeat();
    hb.type = MavType.QUADROTOR;
    hb.autopilot = MavAutopilot.ARDUPILOTMEGA;
    hb.baseMode = MavModeFlag.SAFETY_ARMED | MavModeFlag.STABILIZE_ENABLED | MavModeFlag.CUSTOM_MODE_ENABLED;
    hb.customMode = 4; // ArduCopter GUIDED
    hb.systemStatus = MavState.ACTIVE;
    hb.mavlinkVersion = 3;
    const packet = encodePacket(hb, { seq: 1, sysid: 1, compid: 1 });

    await emit(DATA_EVENT, { bytes: Array.from(packet) });

    expect(await screen.findByText("Квадрокоптер")).toBeInTheDocument();
    expect(screen.getByText("ArduPilot")).toBeInTheDocument();
    expect(screen.getByText("Активний")).toBeInTheDocument();
    // customMode 4 -> COPTER_MODE_NAMES; now shown both in the PFD's own mode badge and the
    // always-visible VehicleStatusBar, so at least one match rather than exactly one.
    expect(screen.getAllByText("GUIDED").length).toBeGreaterThan(0);
    // "Armed" appears as both a label and the current value - assert at least one match.
    expect(screen.getAllByText("Озброєно").length).toBeGreaterThan(0);
    expect(screen.queryByText("Очікування першого heartbeat від апарата...")).not.toBeInTheDocument();
  });

  it("ignores another MAVLink system's heartbeat and telemetry sharing the same link", async () => {
    // Real hardware links often carry more than just the flight controller's own traffic - a
    // companion computer or telemetry-bridge relay heartbeats too, identifying itself with
    // MAV_AUTOPILOT_INVALID (the standard MAVLink convention for "not an autopilot") rather
    // than ArduPilot's own ARDUPILOTMEGA. Without filtering, that foreign heartbeat (and any
    // telemetry from the same foreign sysid) could overwrite the real vehicle's display with
    // garbage - this is exactly the bug a live user hit and reported.
    mockBackend();
    const { clickConnect, getStatusAlert } = getView();
    await clickConnect();
    await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
    await within(getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");

    // A foreign, non-ArduPilot heartbeat arrives first - must not populate the vehicle panel.
    const foreignHb = new Heartbeat();
    foreignHb.type = MavType.GENERIC;
    foreignHb.autopilot = MavAutopilot.INVALID;
    foreignHb.baseMode = 0 as MavModeFlag;
    foreignHb.customMode = 841182678; // garbage, as a companion computer's own heartbeat would carry
    foreignHb.systemStatus = MavState.ACTIVE;
    foreignHb.mavlinkVersion = 3;
    await emit(DATA_EVENT, { bytes: Array.from(encodePacket(foreignHb, { seq: 1, sysid: 99, compid: 1 })) });

    expect(screen.queryByText("ArduPilot")).not.toBeInTheDocument();
    expect(screen.getByText("Очікування першого heartbeat від апарата...")).toBeInTheDocument();

    // The real ArduPilot heartbeat arrives on a different sysid - this one must win.
    const realHb = new Heartbeat();
    realHb.type = MavType.QUADROTOR;
    realHb.autopilot = MavAutopilot.ARDUPILOTMEGA;
    realHb.baseMode = MavModeFlag.STABILIZE_ENABLED;
    realHb.customMode = 0;
    realHb.systemStatus = MavState.ACTIVE;
    realHb.mavlinkVersion = 3;
    await emit(DATA_EVENT, { bytes: Array.from(encodePacket(realHb, { seq: 2, sysid: 1, compid: 1 })) });
    await screen.findByText("ArduPilot");

    const realSys = new SysStatus();
    realSys.voltageBattery = 16800; // mV
    realSys.currentBattery = 520; // cA
    realSys.batteryRemaining = 77; // %
    await emit(DATA_EVENT, { bytes: Array.from(encodePacket(realSys, { seq: 3, sysid: 1, compid: 1 })) });
    await screen.findByText("16.80 V");

    // The foreign system keeps heartbeating and now also sends its own SYS_STATUS - both must
    // be ignored outright since a vehicle (sysid 1) is already established.
    await emit(DATA_EVENT, { bytes: Array.from(encodePacket(foreignHb, { seq: 4, sysid: 99, compid: 1 })) });
    const foreignSys = new SysStatus();
    foreignSys.voltageBattery = 1610; // mV - the implausible reading from the reported bug
    foreignSys.currentBattery = 7150; // cA
    foreignSys.batteryRemaining = 88; // %
    await emit(DATA_EVENT, { bytes: Array.from(encodePacket(foreignSys, { seq: 5, sysid: 99, compid: 1 })) });

    // Still the real vehicle's data - untouched by the foreign system's packets.
    expect(screen.getByText("ArduPilot")).toBeInTheDocument();
    expect(screen.getByTestId(PFD_TEST_IDS.modeBadge)).toHaveTextContent("STABILIZE");
    expect(screen.getByText("16.80 V")).toBeInTheDocument();
    expect(screen.queryByText("841182678")).not.toBeInTheDocument();
  });

  it("sends its own periodic GCS heartbeat once connected", async () => {
    const invoked = vi.fn();
    mockBackend(invoked);
    const { clickConnect, getStatusAlert } = getView();
    await clickConnect();

    await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
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
    await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
    await within(getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");

    const hb = new Heartbeat();
    hb.type = MavType.QUADROTOR;
    hb.autopilot = MavAutopilot.ARDUPILOTMEGA;
    hb.baseMode = MavModeFlag.STABILIZE_ENABLED;
    hb.customMode = 0;
    hb.systemStatus = MavState.ACTIVE;
    hb.mavlinkVersion = 3;
    await emit(DATA_EVENT, { bytes: Array.from(encodePacket(hb, { seq: 1, sysid: 1, compid: 1 })) });
    await screen.findByText("Активний");

    const att = new Attitude();
    att.roll = 0.1745329; // ~10 deg
    att.pitch = -0.0872665; // ~-5 deg
    att.yaw = 1.5707963; // 90 deg
    await emit(DATA_EVENT, { bytes: Array.from(encodePacket(att, { seq: 2, sysid: 1, compid: 1 })) });

    const vfr = new VfrHud();
    vfr.airspeed = 12.3;
    vfr.groundspeed = 11.8;
    vfr.alt = 123.4;
    vfr.climb = 0.5;
    vfr.heading = 267; // deliberately not a multiple of the tape's 10-degree tick step
    vfr.throttle = 65;
    await emit(DATA_EVENT, { bytes: Array.from(encodePacket(vfr, { seq: 3, sysid: 1, compid: 1 })) });

    const sys = new SysStatus();
    sys.voltageBattery = 16800; // mV
    sys.currentBattery = 520; // cA
    sys.batteryRemaining = 77; // %
    await emit(DATA_EVENT, { bytes: Array.from(encodePacket(sys, { seq: 4, sysid: 1, compid: 1 })) });

    const gps = new GpsRawInt();
    gps.fixType = GpsFixType.GPS_FIX_TYPE_3D_FIX;
    gps.satellitesVisible = 14;
    await emit(DATA_EVENT, { bytes: Array.from(encodePacket(gps, { seq: 5, sysid: 1, compid: 1 })) });

    const pos = new GlobalPositionInt();
    pos.lat = 504500000; // 50.45 deg * 1e7
    pos.lon = 305200000; // 30.52 deg * 1e7
    pos.relativeAlt = 100000; // 100 m in mm
    await emit(DATA_EVENT, { bytes: Array.from(encodePacket(pos, { seq: 6, sysid: 1, compid: 1 })) });

    // Roll/pitch/yaw drive the attitude ball's geometry (rotation/translation), not text -
    // covered directly by PrimaryFlightDisplay's own tests. Here we check the values that do
    // render as text: the PFD's speed/altitude/heading tape readouts, the mode badge, and the
    // plain-text battery/GPS/position rows kept below the PFD.
    expect(await screen.findByText("12.3")).toBeInTheDocument(); // airspeed tape
    expect(screen.getByText("123")).toBeInTheDocument(); // altitude tape
    expect(screen.getByText("267")).toBeInTheDocument(); // heading tape
    expect(screen.getByTestId(PFD_TEST_IDS.armedBadge)).toHaveTextContent("Не озброєно");
    expect(screen.getByTestId(PFD_TEST_IDS.modeBadge)).toHaveTextContent("STABILIZE"); // customMode 0 -> COPTER_MODE_NAMES
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
    await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
    await within(getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");

    invoked.mockClear();
    await emit(DATA_EVENT, { bytes: sampleHeartbeatBytes() });

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

    it("keeps the armed/battery/GPS status bar visible after navigating away from Telemetry", async () => {
      const { clickDevMode, clickMotorsNav, getStatusAlert } = getView();
      await clickDevMode();
      await within(getStatusAlert()).findByText(/Підключено/);

      const statusBar = await screen.findByRole("status");
      expect(statusBar).toHaveTextContent("Озброїти"); // the disarmed-state action button

      await clickMotorsNav();

      // Still present (and still reporting live values) once the active section is no longer
      // Telemetry - this bar exists precisely so arm/battery state isn't lost while on other tabs.
      expect(screen.getByRole("status")).toHaveTextContent("Озброїти");
    });

    it(
      "loading parameters exercises the real load/list/missing-param round trip against the simulator",
      async () => {
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
      },
      20000,
    );

    it(
      "downloads parameter defaults over MAVLink FTP and shows them in the Default column",
      async () => {
        const { user, clickDevMode, clickParametersNav, getStatusAlert } = getView();
        await clickDevMode();
        await within(getStatusAlert()).findByText(/Підключено/);
        await clickParametersNav();

        await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));
        await screen.findByText("ARSPD_USE");

        await user.click(screen.getByRole("button", { name: "Завантажити стандартні значення" }));

        // ARSPD_RATIO is the one seeded param the mock simulator gives a genuinely different
        // default (2.0) from its live value (1.98, see mockVehicleSimulator.ts's
        // SIMULATED_PARAM_DEFAULTS) - proof the Default column reflects the real
        // param.pck?withdefaults=1 download over MAVLink FTP, not just echoing the live value.
        fireEvent.change(screen.getByPlaceholderText("Пошук параметрів..."), { target: { value: "ARSPD_RATIO" } });
        const row = (await screen.findByText("ARSPD_RATIO")).closest('[role="row"]');
        expect(row).not.toBeNull();
        expect(within(row as HTMLElement).getByText("2")).toBeInTheDocument();
      },
      20000,
    );

    it(
      "\"Only changed from default\" filters out params already sitting at their default",
      async () => {
        const { user, clickDevMode, clickParametersNav, getStatusAlert } = getView();
        await clickDevMode();
        await within(getStatusAlert()).findByText(/Підключено/);
        await clickParametersNav();

        await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));
        await screen.findByText("ARSPD_USE");
        await user.click(screen.getByRole("button", { name: "Завантажити стандартні значення" }));

        fireEvent.change(screen.getByPlaceholderText("Пошук параметрів..."), { target: { value: "ARSPD" } });
        // Both ARSPD_USE (sitting at its default) and ARSPD_RATIO (overridden, see the previous
        // test) are visible before the filter is applied.
        await screen.findByText("ARSPD_USE");
        expect(screen.getByText("ARSPD_RATIO")).toBeInTheDocument();

        await user.click(screen.getByRole("checkbox", { name: "Лише змінені від стандартних" }));

        expect(screen.getByText("ARSPD_RATIO")).toBeInTheDocument();
        expect(screen.queryByText("ARSPD_USE")).not.toBeInTheDocument();
      },
      20000,
    );

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
      await emit(STATUS_EVENT, { kind: "connected", detail: "serial:COM3@57600" });
      await emit(DATA_EVENT, { bytes: sampleHeartbeatBytes() });

      // The connected detail string already names the exact port/baud that won - the port
      // select itself is hidden once connected (see ArduPilotSetupHeader.tsx), so this is the
      // only place left to confirm which one auto-connect actually landed on.
      expect(await within(getStatusAlert()).findByText("Підключено: serial:COM3@57600")).toBeInTheDocument();
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
        await emit(STATUS_EVENT, { kind: "connected", detail: "serial:COM3@57600" });
        // No heartbeat for COM3 at any baud rate - the scan must exhaust all 5 standard
        // rates on this port (real timers, ~2s each) before moving on to COM4.

        await vi.waitFor(() => expect(calledWithPort(invoked, "connect_serial", "COM4")).toBe(true), {
          timeout: 15000,
        });
        const com3Attempts = invoked.mock.calls.filter(
          ([c, payload]) => c === "connect_serial" && (payload as { portName?: string } | undefined)?.portName === "COM3",
        ).length;
        expect(com3Attempts).toBe(5); // every standard baud rate was tried on COM3 before giving up on it

        await emit(STATUS_EVENT, { kind: "connected", detail: "serial:COM4@57600" });
        await emit(DATA_EVENT, { bytes: sampleHeartbeatBytes() });

        // The port select is hidden once connected (see ArduPilotSetupHeader.tsx) - the
        // connected detail string is now the only place confirming COM4, not COM3, won.
        expect(await within(getStatusAlert()).findByText("Підключено: serial:COM4@57600")).toBeInTheDocument();
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
        await emit(STATUS_EVENT, { kind: "connected", detail: "serial:COM3@57600" });
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
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");

      // telemetry section shown by default (no heartbeat yet, so it's still waiting for one)
      expect(screen.getByText("Очікування першого heartbeat від апарата...")).toBeInTheDocument();

      await clickParametersNav();
      expect(screen.queryByText("Очікування першого heartbeat від апарата...")).not.toBeInTheDocument();
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
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: samplePlaneHeartbeatBytes() });
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

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("SERVO1_FUNCTION", 4, MavParamType.INT16, 0, 1, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("SERVO1_MIN", 1000, MavParamType.INT16, 1, 1, 2) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("SERVO1_MAX", 2000, MavParamType.INT16, 2, 1, 3) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("SERVO1_TRIM", 1500, MavParamType.INT16, 3, 1, 4) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("SERVO2_FUNCTION", 0, MavParamType.INT16, 4, 1, 5) });

      expect(await screen.findByText("Aileron")).toBeInTheDocument();
      const table = screen.getByRole("table");
      expect(within(table).getByText("1")).toBeInTheDocument(); // channel number
      // Scoped to the table, not the whole page - VehicleStatusBar also renders "-" for an
      // unavailable battery reading, which this test never sends.
      expect(within(table).getByText("-")).toBeInTheDocument(); // no SERVO_OUTPUT_RAW yet
      expect(screen.getAllByRole("row")).toHaveLength(2); // header + exactly one active channel (2 is Disabled)

      await emit(DATA_EVENT, { bytes: buildServoOutputRawBytes(0, [1500], 5) });
      expect(await screen.findByText("1500 us")).toBeInTheDocument();
    });

    it("press-and-hold sends a deflected DO_SET_SERVO on pointerdown and returns to trim on pointerup", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      await connectPlaneAndOpenMotors();

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("SERVO1_FUNCTION", 4, MavParamType.INT16, 0, 1, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("SERVO1_MIN", 1000, MavParamType.INT16, 1, 1, 2) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("SERVO1_MAX", 2000, MavParamType.INT16, 2, 1, 3) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("SERVO1_TRIM", 1500, MavParamType.INT16, 3, 1, 4) });
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
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: sampleHeartbeatBytes() }); // QUADROTOR
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

    it("renders the verified Quad X diagram on the Test & Reverse tab, and press-and-hold sends DO_MOTOR_TEST", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectCopterAndOpenMotors();

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_CLASS", 1, MavParamType.INT8, 0, 2, 1) }); // Quad
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_TYPE", 1, MavParamType.INT8, 1, 2, 2) }); // X
      await user.click(await screen.findByRole("tab", { name: "2. Тест і реверс" }));

      const diagram = await screen.findByRole("img", { name: "Motor layout" });
      expect(diagram).toBeInTheDocument();
      const motor1Group = within(diagram).getByText("1").closest("g")!;

      fireEvent.pointerDown(motor1Group);
      expect(findMotorTestThrottle(invoked, 1)).toBe(10);

      fireEvent.pointerUp(motor1Group);
      expect(findMotorTestThrottle(invoked, 1)).toBe(0);
    });

    it("adjusting the test-throttle slider changes the percentage sent by DO_MOTOR_TEST, and Stop all motors halts identification", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectCopterAndOpenMotors();

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_CLASS", 1, MavParamType.INT8, 0, 2, 1) }); // Quad
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_TYPE", 1, MavParamType.INT8, 1, 2, 2) }); // X
      await user.click(await screen.findByRole("tab", { name: "2. Тест і реверс" }));

      const stopAllButton = screen.getByRole("button", { name: "Зупинити всі мотори" });
      expect(stopAllButton).toBeDisabled(); // nothing spinning yet

      fireEvent.change(screen.getByRole("slider"), { target: { value: "25" } });
      expect(await screen.findByText("25%")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Почати ідентифікацію" }));
      expect(findMotorTestThrottle(invoked, 1)).toBe(25); // reflects the adjusted slider, not the old fixed 10%
      expect(stopAllButton).not.toBeDisabled();

      await user.click(stopAllButton);
      expect(findMotorTestThrottle(invoked, 1)).toBe(0);
      expect(stopAllButton).toBeDisabled();
      // Identification itself was cancelled, not just the motor stopped - back to the intro copy.
      expect(screen.getByRole("button", { name: "Почати ідентифікацію" })).toBeInTheDocument();
    });

    it("shows a reboot-required warning and lets Frame Class/Type be changed via PARAM_SET", async () => {
      // Deliberately does NOT stub a resolving fetch here (unlike the "parameters" describe
      // block's docs tests below) - fetchParamDocs caches successful ArduCopter results at
      // module scope (in-memory + localStorage), and this file's tests share that module, so a
      // real fetch here would leak cached docs into those later tests. The file-wide beforeEach
      // already stubs fetch to reject, which exercises MotorsCopterSection's offline
      // FRAME_CLASS_NAMES/FRAME_TYPE_NAMES fallback (see frameDiagrams.ts) - a real user must be
      // able to pick a genuinely different class/type here, not just re-submit the one the
      // vehicle already reported (a single-option <select> can't be changed by a real user at
      // all, even though a test could still fire a same-value change event on it and get a false
      // pass - this bug shipped once already and was reported against a real vehicle).
      const invoked = vi.fn();
      mockBackend(invoked);
      await connectCopterAndOpenMotors();

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_CLASS", 1, MavParamType.INT8, 0, 2, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_TYPE", 1, MavParamType.INT8, 1, 2, 2) });
      // The Frame tab is the wizard's default landing step - no navigation needed.
      await screen.findByRole("combobox", { name: "Клас рами" });

      expect(
        screen.getByText("Зміна класу або типу рами вимагає перезавантаження - вона не застосується одразу."),
      ).toBeInTheDocument();

      // Real, human-readable option labels are present without needing the docs fetch to
      // succeed - the offline enum, not a single locked-in numeric option.
      expect(screen.getByRole("option", { name: "Quad" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Hexa" })).toBeInTheDocument();

      const frameClassSelect = screen.getByRole("combobox", { name: "Клас рами" });
      fireEvent.change(frameClassSelect, { target: { value: "2" } }); // Quad -> Hexa

      const paramSet = invoked.mock.calls.find(
        ([cmd, payload]) => cmd === "send_bytes" && (payload as { bytes: number[] }).bytes[7] === ParamSet.MSG_ID,
      );
      expect(paramSet).toBeDefined();
      const bytes = (paramSet![1] as { bytes: number[] }).bytes;
      const payload = new Uint8Array(bytes.slice(10)); // 10-byte v2 header
      expect(paramWireBitsToValue(readParamValueBits(payload), MavParamType.INT8)).toBe(2);
    });

    it("clicking Reboot Now on the Reboot tab sends PREFLIGHT_REBOOT_SHUTDOWN(autopilot=REBOOT)", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectCopterAndOpenMotors();

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_CLASS", 1, MavParamType.INT8, 0, 2, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_TYPE", 1, MavParamType.INT8, 1, 2, 2) });
      await user.click(await screen.findByRole("tab", { name: "3. Перезавантаження" }));

      await user.click(screen.getByRole("button", { name: "Перезавантажити зараз" }));

      const sent = findCommandLongSend(invoked, MavCmd.PREFLIGHT_REBOOT_SHUTDOWN);
      expect(sent).toBeDefined();
      const bytes = (sent![1] as { bytes: number[] }).bytes;
      const view = new DataView(new Uint8Array(bytes).buffer);
      // param1 (autopilot) is COMMAND_LONG's first float32 field - payload starts at absolute
      // byte 10 (10-byte v2 header), same base findCommandLongSend uses for `command` at 38.
      expect(view.getFloat32(10, true)).toBe(RebootShutdownAction.REBOOT);

      // Reboot tab now shows an info alert and gates "Continue to Summary" until it's sent.
      expect(await screen.findByText(/Команду перезавантаження надіслано/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Перейти до підсумку" }));
      expect(await screen.findByText("Підсумок налаштування моторів")).toBeInTheDocument();
    });

    it("toggling a motor's Reverse checkbox on the Test & Reverse tab sends SERVOx_REVERSED via PARAM_SET", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectCopterAndOpenMotors();

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_CLASS", 1, MavParamType.INT8, 0, 2, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_TYPE", 1, MavParamType.INT8, 1, 2, 2) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("SERVO1_REVERSED", 0, MavParamType.INT8, 2, 2, 3) });
      await user.click(await screen.findByRole("tab", { name: "2. Тест і реверс" }));
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

    it("falls back to a plain per-motor list (with live PWM) on the Test & Reverse tab for an unverified frame class/type", async () => {
      mockBackend();
      const { user } = await connectCopterAndOpenMotors();

      // Tri (class 7) has no verified position/rotation diagram, but its motor count (3) is
      // still known - see motorCountForFrameClass in frameDiagrams.ts.
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_CLASS", 7, MavParamType.INT8, 0, 2, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_TYPE", 0, MavParamType.INT8, 1, 2, 2) });
      await user.click(await screen.findByRole("tab", { name: "2. Тест і реверс" }));

      expect(
        await screen.findByText(
          "Немає перевіреної схеми моторів для цього поєднання класу/типу рами - розташування треба звірити з офіційною документацією ArduPilot.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Утримуйте для тесту 1/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Утримуйте для тесту 3/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Утримуйте для тесту 4/ })).not.toBeInTheDocument();
    });

    it("lets a user jump straight to Test & Reverse without walking through Frame first (quick adjustment)", async () => {
      mockBackend();
      const { user } = await connectCopterAndOpenMotors();

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_CLASS", 1, MavParamType.INT8, 0, 2, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_TYPE", 1, MavParamType.INT8, 1, 2, 2) });

      // Default landing tab is Frame - the diagram/reverse checkboxes aren't rendered yet.
      const testTab = await screen.findByRole("tab", { name: "2. Тест і реверс" });
      expect(screen.queryByRole("img", { name: "Motor layout" })).not.toBeInTheDocument();

      // A single click reaches Test & Reverse directly, with no forced Next/Next progression.
      await user.click(testTab);
      expect(await screen.findByRole("img", { name: "Motor layout" })).toBeInTheDocument();
    });

    it("guided identification auto-spins each motor in turn, and confirming the correct position advances without the user holding anything", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectCopterAndOpenMotors();

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_CLASS", 1, MavParamType.INT8, 0, 2, 1) }); // Quad
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_TYPE", 1, MavParamType.INT8, 1, 2, 2) }); // X
      await user.click(await screen.findByRole("tab", { name: "2. Тест і реверс" }));
      const diagram = await screen.findByRole("img", { name: "Motor layout" });

      await user.click(screen.getByRole("button", { name: "Почати ідентифікацію" }));
      // The app drives motor 1 on its own - no press-and-hold from the user.
      expect(findMotorTestThrottle(invoked, 1)).toBe(10);
      expect(screen.getByText("1 / 4")).toBeInTheDocument();

      // Clicking motor 1's own position confirms it and stops it, then auto-starts motor 2.
      const motor1Group = within(diagram).getByText("1").closest("g")!;
      fireEvent.pointerDown(motor1Group);
      expect(findMotorTestThrottle(invoked, 1)).toBe(0);
      expect(findMotorTestThrottle(invoked, 2)).toBe(10);
      expect(screen.getByText("2 / 4")).toBeInTheDocument();
    });

    it("clicking a different position than the one spinning records a mismatch, shown once identification finishes", async () => {
      mockBackend();
      const { user } = await connectCopterAndOpenMotors();

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_CLASS", 1, MavParamType.INT8, 0, 2, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_TYPE", 1, MavParamType.INT8, 1, 2, 2) });
      await user.click(await screen.findByRole("tab", { name: "2. Тест і реверс" }));
      const diagram = await screen.findByRole("img", { name: "Motor layout" });

      await user.click(screen.getByRole("button", { name: "Почати ідентифікацію" }));

      // Motor 1 is the one actually spinning, but the user clicks position 2 instead - a real
      // wiring/frame mismatch worth flagging, not silently accepted as confirming motor 2.
      const clickPosition = (motor: number) => fireEvent.pointerDown(within(diagram).getByText(String(motor)).closest("g")!);
      clickPosition(2);
      clickPosition(2);
      clickPosition(3);
      clickPosition(4);

      expect(await screen.findByText("Ідентифікацію завершено")).toBeInTheDocument();
      expect(screen.getByText(/Ви клацнули 2, але обертався вихід 1/)).toBeInTheDocument();
    });

    it("manual test-and-reverse controls stay available while guided identification is idle", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectCopterAndOpenMotors();

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_CLASS", 1, MavParamType.INT8, 0, 2, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FRAME_TYPE", 1, MavParamType.INT8, 1, 2, 2) });
      await user.click(await screen.findByRole("tab", { name: "2. Тест і реверс" }));
      const diagram = await screen.findByRole("img", { name: "Motor layout" });

      // Not identifying - clicking the diagram still runs the existing free-form hold-to-test.
      const motor1Group = within(diagram).getByText("1").closest("g")!;
      fireEvent.pointerDown(motor1Group);
      expect(findMotorTestThrottle(invoked, 1)).toBe(10);
      fireEvent.pointerUp(motor1Group);
      expect(findMotorTestThrottle(invoked, 1)).toBe(0);

      expect(screen.getAllByRole("checkbox", { name: "Реверс" }).length).toBe(4);
    });
  });

  describe("PID tune (Copter)", () => {
    async function connectCopterAndOpenPidTune() {
      const view = getView();
      await view.clickConnect();
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: sampleHeartbeatBytes() }); // QUADROTOR
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
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("ATC_RAT_RLL_P", 0.125, MavParamType.REAL32, 0, 1, 1) });
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

    it("hides the 'View in Graphs' deep-link when no flight log is loaded", async () => {
      mockBackend();
      const { user } = await connectCopterAndOpenPidTune();
      await user.click(screen.getByRole("button", { name: "Завантажити параметри PID" }));
      expect(screen.queryByRole("button", { name: "Переглянути в Графіках" })).not.toBeInTheDocument();
    });

    it("shows a 'View in Graphs' button per roll/pitch/yaw axis once a flight log is loaded, and clicking one sets the Graphs deep-link", async () => {
      mockBackend();
      useFileStore.getState().setFile({ name: "sample.bin", buf: new ArrayBuffer(0) });
      const { user } = await connectCopterAndOpenPidTune();
      await user.click(screen.getByRole("button", { name: "Завантажити параметри PID" }));

      const viewInGraphsButtons = screen.getAllByRole("button", { name: "Переглянути в Графіках" });
      expect(viewInGraphsButtons).toHaveLength(3); // roll, pitch, yaw

      await user.click(viewInGraphsButtons[0]!); // roll is the first axis rendered

      expect(useUiStore.getState().pendingPresetKey).toBe("pidRoll");
      expect(useUiStore.getState().activeTab).toBe("graphs");
    });

    it("shows a 'changed from default' marker next to a gain once FTP defaults are available and it differs", async () => {
      mockBackend();
      await connectCopterAndOpenPidTune();
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("ATC_RAT_RLL_P", 0.25, MavParamType.REAL32, 0, 1, 1) });
      expect(await screen.findByText("0.25")).toBeInTheDocument();

      expect(screen.queryByLabelText(/Змінено від стандартного/)).not.toBeInTheDocument();
      useMavlinkParamDefaultsStore.getState().setDone({ ATC_RAT_RLL_P: 0.135 });

      expect(await screen.findByLabelText("Змінено від стандартного (0.135)")).toBeInTheDocument();
    });
  });

  describe("PID tune (Plane)", () => {
    async function connectPlaneAndOpenPidTune() {
      const view = getView();
      await view.clickConnect();
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: samplePlaneHeartbeatBytes() });
      await view.user.click(view.getPidTuneNavButton());
      return view;
    }

    it("resolves the modern RLL_RATE_P candidate when that's the one the vehicle reports", async () => {
      mockBackend();
      await connectPlaneAndOpenPidTune();
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("RLL_RATE_P", 0.5, MavParamType.REAL32, 0, 1, 1) });
      expect(await screen.findByText("0.5")).toBeInTheDocument();
    });

    it("falls back to the legacy RLL2SRV_P candidate when that's the only one the vehicle reports", async () => {
      mockBackend();
      await connectPlaneAndOpenPidTune();
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("RLL2SRV_P", 0.75, MavParamType.REAL32, 0, 1, 1) });
      expect(await screen.findByText("0.75")).toBeInTheDocument();
    });

    it("shows the yaw damper's Damp/Int/Slip gains, which have no P/I/D naming", async () => {
      mockBackend();
      await connectPlaneAndOpenPidTune();
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("YAW2SRV_DAMP", 0.5, MavParamType.REAL32, 0, 3, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("YAW2SRV_INT", 0.125, MavParamType.REAL32, 1, 3, 2) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("YAW2SRV_SLIP", 0.25, MavParamType.REAL32, 2, 3, 3) });
      expect(await screen.findByText("0.5")).toBeInTheDocument();
      expect(screen.getByText("0.125")).toBeInTheDocument();
      expect(screen.getByText("0.25")).toBeInTheDocument();
    });

    it("shows the roll/pitch angle-loop shaping terms (Angle P, TC, Max Rate)", async () => {
      mockBackend();
      await connectPlaneAndOpenPidTune();
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("RLL2SRV_ANGLE_P", 0, MavParamType.REAL32, 0, 4, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("RLL2SRV_TCONST", 0.5, MavParamType.REAL32, 1, 4, 2) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("RLL2SRV_RMAX", 60, MavParamType.INT16, 2, 4, 3) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("PTCH2SRV_RMAX_UP", 40, MavParamType.INT16, 3, 4, 4) });
      expect(await screen.findByText("0.5")).toBeInTheDocument();
      expect(screen.getByText("60")).toBeInTheDocument();
      expect(screen.getByText("40")).toBeInTheDocument();
    });
  });

  describe("PID tune (Rover)", () => {
    async function connectRoverAndOpenPidTune() {
      const view = getView();
      await view.clickConnect();
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: sampleRoverHeartbeatBytes() });
      await view.user.click(view.getPidTuneNavButton());
      return view;
    }

    it("shows the steering rate/angle gains and the speed gains, Rover's own axis pair", async () => {
      mockBackend();
      await connectRoverAndOpenPidTune();
      // Binary-exact fractions (0.5, 0.25) - unlike 0.2, these round-trip through a REAL32
      // wire encode/decode with no floating-point display artifacts.
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("ATC_STR_RAT_P", 0.5, MavParamType.REAL32, 0, 2, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("ATC_STR_ANG_P", 2, MavParamType.REAL32, 1, 2, 2) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("ATC_SPEED_P", 0.25, MavParamType.REAL32, 0, 1, 3) });

      expect(await screen.findByText("Рульове керування")).toBeInTheDocument();
      expect(screen.getByText("Швидкість")).toBeInTheDocument();
      expect(screen.getByText("0.5")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("0.25")).toBeInTheDocument();
    });
  });

  describe("PID tune (Sub)", () => {
    async function connectSubAndOpenPidTune() {
      const view = getView();
      await view.clickConnect();
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: sampleSubHeartbeatBytes() });
      await view.user.click(view.getPidTuneNavButton());
      return view;
    }

    it("reuses Copter's Roll/Pitch/Yaw ATC_RAT_*/ATC_ANG_* naming (byte-identical between AC_AttitudeControl_Sub and _Multi)", async () => {
      mockBackend();
      await connectSubAndOpenPidTune();
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("ATC_RAT_RLL_P", 0.5, MavParamType.REAL32, 0, 1, 1) });

      expect(await screen.findByText("Крен")).toBeInTheDocument();
      expect(screen.getByText("Тангаж")).toBeInTheDocument();
      expect(screen.getByText("Рискання")).toBeInTheDocument();
      expect(screen.getByText("0.5")).toBeInTheDocument();
    });
  });

  describe("PID tune (AntennaTracker)", () => {
    async function connectTrackerAndOpenPidTune() {
      const view = getView();
      await view.clickConnect();
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: sampleTrackerHeartbeatBytes() });
      await view.user.click(view.getPidTuneNavButton());
      return view;
    }

    it("shows Pitch/Yaw as ordinary P/I/D/FF gains, unlike Plane's differently-shaped yaw damper", async () => {
      mockBackend();
      await connectTrackerAndOpenPidTune();
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("PITCH2SRV_P", 0.5, MavParamType.REAL32, 0, 2, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("YAW2SRV_D", 0.25, MavParamType.REAL32, 1, 2, 2) });

      expect(await screen.findByText("Тангаж")).toBeInTheDocument();
      expect(screen.getByText("Рискання")).toBeInTheDocument();
      expect(screen.getByText("0.5")).toBeInTheDocument();
      expect(screen.getByText("0.25")).toBeInTheDocument();
    });
  });

  describe("ESC calibration", () => {
    async function connectAndOpenEscCal() {
      const view = getView();
      await view.clickConnect();
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: sampleHeartbeatBytes() });
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
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: sampleHeartbeatBytes() });
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
      await emit(DATA_EVENT, { bytes: Array.from(encodePacket(sys, { seq: 1, sysid: 1, compid: 1 })) });
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

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("BATT_CAPACITY", 5000, MavParamType.INT32, 0, 1, 1) });
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

    it("shows a 'changed from default' marker once FTP defaults are available and the value differs", async () => {
      mockBackend();
      await connectAndOpenBatteryConfig();
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("BATT_CAPACITY", 6000, MavParamType.INT32, 0, 1, 1) });
      await screen.findByText("6000");

      // Simulates defaults already downloaded elsewhere this session (via the Parameters tab's
      // own FTP flow, covered by its own test) - mavlinkParamDefaultsStore is shared app-wide,
      // so BatteryConfigSection just passively picks it up without its own FTP trigger.
      expect(screen.queryByLabelText(/Змінено від стандартного/)).not.toBeInTheDocument();
      useMavlinkParamDefaultsStore.getState().setDone({ BATT_CAPACITY: 5000 });

      expect(await screen.findByLabelText("Змінено від стандартного (5000)")).toBeInTheDocument();
    });
  });

  describe("OSD setup", () => {
    async function connectAndOpenOsdSetup() {
      const view = getView();
      await view.clickConnect();
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: sampleHeartbeatBytes() });
      await view.user.click(screen.getByRole("tab", { name: "Налаштування OSD" }));
      return view;
    }

    it("shows a Load button and not-loaded message", async () => {
      mockBackend();
      await connectAndOpenOsdSetup();
      expect(screen.getByRole("button", { name: "Завантажити налаштування OSD" })).toBeInTheDocument();
      expect(screen.getByText("Налаштування OSD ще не завантажено.")).toBeInTheDocument();
    });

    it("requests every OSD_* param by name when Load is clicked, covering globals and all 4 screens", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenOsdSetup();

      await user.click(screen.getByRole("button", { name: "Завантажити налаштування OSD" }));

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
      expect(requestedNames.has("OSD_TYPE")).toBe(true);
      expect(requestedNames.has("OSD1_ENABLE")).toBe(true);
      expect(requestedNames.has("OSD1_ALTITUDE_EN")).toBe(true);
      expect(requestedNames.has("OSD4_RC_LQ_Y")).toBe(true);
    });

    it("shows OSD_CHAN once it arrives, stages an edit, and Save all sends PARAM_SET with the new value", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenOsdSetup();

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("OSD_CHAN", 0, MavParamType.INT8, 0, 1, 1) });
      const chanInput = await screen.findByDisplayValue("0");
      await user.clear(chanInput);
      await user.type(chanInput, "8");

      const saveAllButton = await screen.findByRole("button", { name: "Зберегти все (1)" });
      await user.click(saveAllButton);
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("OSD_CHAN")).toBeInTheDocument();
      expect(within(dialog).getByText("8")).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "Зберегти" }));

      await vi.waitFor(() => {
        const setRequest = invoked.mock.calls.find(([cmd, payload]) => {
          if (cmd !== "send_bytes") return false;
          const bytes = (payload as { bytes: number[] }).bytes;
          return bytes[7] === ParamSet.MSG_ID;
        });
        expect(setRequest).toBeDefined();
      });
    });

    it("toggles an element's enable checkbox once its _EN param has arrived, staging a change", async () => {
      mockBackend();
      const { user } = await connectAndOpenOsdSetup();

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("OSD1_ALTITUDE_EN", 0, MavParamType.INT8, 0, 1, 1) });
      const row = (await screen.findByText("Висота (AGL)")).closest("tr")!;
      const checkbox = within(row).getByRole("checkbox");
      expect(checkbox).not.toBeChecked();

      await user.click(checkbox);
      expect(checkbox).toBeChecked();
      expect(await screen.findByRole("button", { name: "Зберегти все (1)" })).toBeInTheDocument();
    });

    it("filters the element table by search text", async () => {
      mockBackend();
      await connectAndOpenOsdSetup();
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("OSD1_ALTITUDE_EN", 1, MavParamType.INT8, 0, 1, 1) });
      await screen.findByText("Висота (AGL)");
      expect(screen.getByText("Напруга батареї")).toBeInTheDocument();

      const search = screen.getByPlaceholderText("Пошук елементів...");
      await userEvent.setup().type(search, "висот");

      expect(screen.getByText("Висота (AGL)")).toBeInTheDocument();
      expect(screen.queryByText("Напруга батареї")).not.toBeInTheDocument();
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

      // The Frame tab is the wizard's default landing step - visible with no navigation.
      const frameClassSelect = await screen.findByRole<HTMLSelectElement>("combobox", { name: "Клас рами" });
      const frameTypeSelect = screen.getByRole<HTMLSelectElement>("combobox", { name: "Тип рами" });
      expect(frameClassSelect.value).toBe("3"); // Octa
      expect(frameTypeSelect.value).toBe("1"); // X

      await user.click(screen.getByRole("tab", { name: "2. Тест і реверс" }));
      const diagram = await screen.findByRole("img", { name: "Motor layout" });
      // Octa X has 8 motors - the default Quad X preset would only render 4, so this also
      // proves the selector actually changed what the simulator seeded, not just the label.
      expect(within(diagram).getAllByText(/^[1-8]$/)).toHaveLength(8);
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
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: sampleHeartbeatBytes() });
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

      await emit(DATA_EVENT, {
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

      await emit(DATA_EVENT, {
        bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 2, 1),
      });
      await screen.findByText("ARSPD_USE");

      const bar = screen.getByTestId("param-load-progress");
      expect(bar.firstElementChild).toHaveStyle({ width: "50%" });

      await emit(DATA_EVENT, {
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
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 2, 1) });
      await emit(DATA_EVENT, {
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
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 2, 1) });
      await emit(DATA_EVENT, {
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

    it("orders the table columns as Name, Value, Default, Units, Options, Description", async () => {
      mockBackend();
      const { user } = await connectWithVehicle();
      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));
      await emit(DATA_EVENT, {
        bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 1, 1),
      });
      await screen.findByText("ARSPD_USE");

      const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
      expect(headers).toEqual(["Назва", "Значення", "За замовчуванням", "Одиниці", "Опції", "Опис"]);
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
        await emit(DATA_EVENT, {
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
      await emit(DATA_EVENT, {
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
      await emit(DATA_EVENT, {
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
      await emit(DATA_EVENT, {
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
      await emit(DATA_EVENT, {
        bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 1, 1),
      });
      await screen.findByText("ARSPD_USE");

      expect(
        await screen.findByText("Описи параметрів недоступні (не вдалося з'єднатися з ardupilot.org)."),
      ).toBeInTheDocument();
      // Units, Options, and Description all fall back to "-" once docs are unavailable.
      expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(3);
    });

    it("shows the humanName directly in the cell, and Units/Options once parameter documentation loads", async () => {
      // A single test owns the one legitimate real-fetch-stub slot for the ArduCopter folder in
      // this file - fetchParamDocs caches successful results at module scope (in-memory +
      // localStorage), shared across every test here, so a second test stubbing a different
      // ArduCopter XML would silently get this test's already-cached result instead of its own.
      const sampleXml = `<?xml version="1.0"?><paramfile><vehicles><parameters name="ArduCopter">
        <param humanName="Use airspeed" name="ArduCopter:ARSPD_USE" documentation="Enables airspeed use">
          <values><value code="0">Disabled</value><value code="1">Enabled</value></values>
        </param>
        <param humanName="Throttle filter" name="ArduCopter:PILOT_THR_FILT" documentation="Throttle filter cutoff">
          <field name="Units">Hz</field>
          <field name="Range">0.0 10.0</field>
        </param>
      </parameters></vehicles></paramfile>`;
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(sampleXml) }));

      mockBackend();
      const { user } = await connectWithVehicle(); // sampleHeartbeatBytes() reports MavType.QUADROTOR -> ArduCopter
      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));
      await emit(DATA_EVENT, {
        bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 2, 1),
      });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("PILOT_THR_FILT", 2, MavParamType.INT8, 1, 2, 2) });
      await screen.findByText("ARSPD_USE");

      // Only the short humanName shows directly in the (fixed-height, one-line-truncated) cell -
      // the full documentation sentence and its Read more link are reachable via hover instead
      // (see the next test), rather than being crammed into the row where a long sentence would
      // just get truncated again.
      expect(await screen.findByText("Use airspeed")).toBeInTheDocument();
      expect(screen.queryByText(/Enables airspeed use/)).not.toBeInTheDocument();
      expect(screen.getByText("0: Disabled, 1: Enabled")).toBeInTheDocument();
      expect(screen.getByText("Hz")).toBeInTheDocument();
      expect(screen.getByText("0 - 10")).toBeInTheDocument();
    });

    it("shows the full description and a Read more link in a hover card", async () => {
      // Reuses the ArduCopter docs cached by the previous test rather than stubbing fetch again -
      // see that test's own comment on why only one test in this file may do the real stub for a
      // given folder.
      mockBackend();
      const { user } = await connectWithVehicle();
      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 1, 1) });
      await user.hover(await screen.findByText("Use airspeed"));

      expect(await screen.findByText("Enables airspeed use")).toBeInTheDocument();
      const readMoreLink = screen.getByRole("link", { name: "Детальніше →" });
      expect(readMoreLink).toHaveAttribute("href", "https://ardupilot.org/copter/docs/parameters.html#arspd-use");
    });

    it("groups params sharing a name prefix into a collapsed category, and clicking it filters the table to that group", async () => {
      mockBackend();
      const { user } = await connectWithVehicle();
      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 3, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("ARSPD_RATIO", 2, MavParamType.INT8, 1, 3, 2) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("BATT_MONITOR", 4, MavParamType.INT8, 2, 3, 3) });
      await screen.findByText("BATT_MONITOR");

      // Collapsed by default - the individual param names inside "ARSPD" aren't in the DOM yet
      // (only the table's own two rows show them).
      const arspdGroup = screen.getByRole("button", { name: "ARSPD" });
      expect(screen.getAllByText("ARSPD_USE")).toHaveLength(1);

      await user.click(arspdGroup);

      // Clicking a group both selects it (filtering the table) AND expands it (showing its
      // members in the tree too, same as any collapsible), so the table is scoped to explicitly
      // to check it - BATT_MONITOR's row is gone, only the ARSPD pair remains.
      const table = within(screen.getByRole("table"));
      expect(table.getByText("ARSPD_USE")).toBeInTheDocument();
      expect(table.getByText("ARSPD_RATIO")).toBeInTheDocument();
      expect(table.queryByText("BATT_MONITOR")).not.toBeInTheDocument();
    });

    it("expanding a category and clicking one of its params filters the table to just that param", async () => {
      mockBackend();
      const { user } = await connectWithVehicle();
      await user.click(screen.getByRole("button", { name: "Завантажити параметри" }));
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("ARSPD_USE", 1, MavParamType.INT8, 0, 2, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("ARSPD_RATIO", 2, MavParamType.INT8, 1, 2, 2) });
      await screen.findByText("ARSPD_RATIO");

      await user.click(screen.getByRole("button", { name: "ARSPD" }));
      // Only the expanded tree's own leaf button has role="button" here - the table's Name
      // cells are plain text, so this is still unambiguous.
      await user.click(screen.getByRole("button", { name: "ARSPD_USE" }));

      // The tree stays expanded after selecting a leaf, so its "ARSPD_USE" text is still in the
      // DOM alongside the table's now-single filtered row - scope to the table to check it.
      const table = within(screen.getByRole("table"));
      expect(table.getByText("ARSPD_USE")).toBeInTheDocument();
      expect(table.queryByText("ARSPD_RATIO")).not.toBeInTheDocument();
    });

  });

  describe("compass calibration", () => {
    async function connectAndOpenCompassCal() {
      const view = getView();
      await view.clickConnect();
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: sampleHeartbeatBytes() });
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

      await emit(DATA_EVENT, {
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
      await emit(DATA_EVENT, {
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
      await emit(DATA_EVENT, {
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

      await emit(DATA_EVENT, {
        bytes: buildCommandAckBytes(MavCmd.DO_START_MAG_CAL, MavResult.DENIED, 1),
      });

      expect(await screen.findByText("Апарат відхилив команду: Відхилено")).toBeInTheDocument();
    });
  });

  describe("accelerometer calibration", () => {
    async function connectAndOpenAccelCal() {
      const view = getView();
      await view.clickConnect();
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: sampleHeartbeatBytes() });
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

      await emit(DATA_EVENT, {
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
      await emit(DATA_EVENT, { bytes: buildAccelcalVehiclePosBytes(AccelcalVehiclePos.LEVEL, 1) });
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
      await emit(DATA_EVENT, { bytes: buildAccelcalVehiclePosBytes(AccelcalVehiclePos.LEFT, 2) });
      expect(await screen.findByTestId("accel-cal-position-prompt")).toHaveTextContent("На лівому боці");
      expect(screen.getByTestId(`accel-cal-checklist-${AccelcalVehiclePos.LEVEL}`).className).toContain("border-primary"); // LEVEL now checked off

      // Vehicle reports overall success (a real full cal steps through all 6 - shortcutting the
      // remaining 4 here since the position-request/confirm-echo mechanics are already proven).
      await emit(DATA_EVENT, { bytes: buildAccelcalVehiclePosBytes(AccelcalVehiclePos.SUCCESS, 3) });
      expect(await screen.findByText("Калібрування успішне.")).toBeInTheDocument();
    });

    it("shows a rejection alert when the vehicle NACKs PREFLIGHT_CALIBRATION", async () => {
      mockBackend();
      const { user } = await connectAndOpenAccelCal();
      await user.click(screen.getByRole("button", { name: "Повне калібрування" }));

      await emit(DATA_EVENT, {
        bytes: buildCommandAckBytes(MavCmd.PREFLIGHT_CALIBRATION, MavResult.DENIED, 1),
      });

      expect(await screen.findByText("Апарат відхилив команду: Відхилено")).toBeInTheDocument();
    });
  });

  describe("RC calibration", () => {
    async function connectAndOpenRcCal() {
      const view = getView();
      await view.clickConnect();
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: sampleHeartbeatBytes() });
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

      await emit(DATA_EVENT, { bytes: buildRcChannelsBytes({ 1: 1500, 3: 1000 }, 8, 1) });
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
      await emit(DATA_EVENT, { bytes: buildRcChannelsBytes({ 1: 1500, 3: 1000 }, 8, 2) });
      await emit(DATA_EVENT, { bytes: buildRcChannelsBytes({ 1: 1000, 3: 1000 }, 8, 3) });
      await emit(DATA_EVENT, { bytes: buildRcChannelsBytes({ 1: 2000, 3: 1000 }, 8, 4) });

      expect(await screen.findByText("2000")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Зберегти" })).toBeInTheDocument();
    });

    it("Save writes RC{ch}_MIN/MAX/TRIM/REVERSED via PARAM_SET for every captured channel and sends PREFLIGHT_CALIBRATION(remoteControl=0)", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenRcCal();

      await user.click(screen.getByRole("button", { name: "Почати калібрування" }));
      await emit(DATA_EVENT, { bytes: buildRcChannelsBytes({ 1: 1500 }, 8, 1) });
      await emit(DATA_EVENT, { bytes: buildRcChannelsBytes({ 1: 1000 }, 8, 2) });
      await emit(DATA_EVENT, { bytes: buildRcChannelsBytes({ 1: 2000 }, 8, 3) });
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
      await emit(DATA_EVENT, { bytes: buildRcChannelsBytes({ 1: 1500 }, 8, 1) });
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

      await emit(DATA_EVENT, {
        bytes: buildCommandAckBytes(MavCmd.PREFLIGHT_CALIBRATION, MavResult.UNSUPPORTED, 1),
      });
      expect(screen.queryByText("Апарат озброєний - роззбройте перед калібруванням.")).not.toBeInTheDocument();

      await emit(DATA_EVENT, {
        bytes: buildCommandAckBytes(MavCmd.PREFLIGHT_CALIBRATION, MavResult.FAILED, 2),
      });
      expect(await screen.findByText("Апарат озброєний - роззбройте перед калібруванням.")).toBeInTheDocument();
    });
  });

  describe("RC input setup (flight modes + channel options)", () => {
    async function connectAndOpenRcSetup() {
      const view = getView();
      await view.clickConnect();
      await emit(STATUS_EVENT, { kind: "connected", detail: "udp:0.0.0.0:14550" });
      await within(view.getStatusAlert()).findByText("Підключено: udp:0.0.0.0:14550");
      await emit(DATA_EVENT, { bytes: sampleHeartbeatBytes() });
      await view.clickRcSetupNav();
      return view;
    }

    it("shows a Load button and not-loaded message", async () => {
      mockBackend();
      await connectAndOpenRcSetup();
      expect(screen.getByRole("button", { name: "Завантажити налаштування RC" })).toBeInTheDocument();
      expect(screen.getByText("Налаштування RC-входів ще не завантажено.")).toBeInTheDocument();
    });

    it("requests FLTMODE_CH, FLTMODE1-6, and RC1-16_OPTION by name when Load is clicked", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenRcSetup();

      await user.click(screen.getByRole("button", { name: "Завантажити налаштування RC" }));

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
      expect(requestedNames.has("FLTMODE_CH")).toBe(true);
      expect(requestedNames.has("FLTMODE1")).toBe(true);
      expect(requestedNames.has("FLTMODE6")).toBe(true);
      expect(requestedNames.has("RC1_OPTION")).toBe(true);
      expect(requestedNames.has("RC16_OPTION")).toBe(true);
    });

    it("changing the flight-mode channel stages an edit, and Save All sends PARAM_SET", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenRcSetup();

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FLTMODE_CH", 5, MavParamType.INT8, 0, 7, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FLTMODE1", 0, MavParamType.INT8, 1, 7, 2) });

      const fltModeChannelFunction = await screen.findByRole("button", { name: "Канал режиму польоту" });
      await user.click(fltModeChannelFunction);
      await user.click(screen.getByRole("button", { name: "Канал 6" }));

      const saveAllButton = await screen.findByRole("button", { name: "Зберегти все (1)" });
      await user.click(saveAllButton);
      await user.click(screen.getByRole("button", { name: "Зберегти" }));

      const paramSet = invoked.mock.calls.find(
        ([cmd, payload]) => cmd === "send_bytes" && (payload as { bytes: number[] }).bytes[7] === ParamSet.MSG_ID,
      );
      expect(paramSet).toBeDefined();
      const bytes = (paramSet![1] as { bytes: number[] }).bytes;
      const nameBytes = bytes.slice(16, 16 + 16);
      const nullIndex = nameBytes.indexOf(0);
      expect(String.fromCharCode(...nameBytes.slice(0, nullIndex === -1 ? undefined : nullIndex))).toBe("FLTMODE_CH");
    });

    it("highlights the FLTMODE slot whose PWM band matches the live flight-mode-channel signal", async () => {
      mockBackend();
      await connectAndOpenRcSetup();

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FLTMODE_CH", 5, MavParamType.INT8, 0, 7, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FLTMODE1", 0, MavParamType.INT8, 1, 7, 2) });
      await screen.findByRole("heading", { name: "Функції" });

      // Band 3 (1361-1490us, third FLTMODE slot) - see rcBands.ts's documented boundaries.
      await emit(DATA_EVENT, { bytes: buildRcChannelsBytes({ 5: 1425 }, 8, 1) });

      expect(await screen.findByText("активний")).toBeInTheDocument();
      expect(screen.getByText("1361-1490 us")).toBeInTheDocument();
    });

    it("staging an RC option edit and saving sends PARAM_SET for that channel", async () => {
      const invoked = vi.fn();
      mockBackend(invoked);
      const { user } = await connectAndOpenRcSetup();

      await emit(DATA_EVENT, { bytes: buildParamValueBytes("FLTMODE_CH", 5, MavParamType.INT8, 0, 7, 1) });
      await emit(DATA_EVENT, { bytes: buildParamValueBytes("RC7_OPTION", 0, MavParamType.INT16, 1, 7, 2) });

      // Docs fetch is stubbed to reject in this suite, so the RCx_OPTION enum never loads -
      // this exercises the custom-function-code fallback path instead of the docs-driven list.
      const customCodeInput = await screen.findByPlaceholderText("Або введіть код функції...");
      await user.type(customCodeInput, "153");
      await user.click(screen.getByRole("button", { name: "Застосувати" }));
      await user.click(screen.getByRole("button", { name: "Канал 7" }));

      const saveAllButton = await screen.findByRole("button", { name: "Зберегти все (1)" });
      await user.click(saveAllButton);
      await user.click(screen.getByRole("button", { name: "Зберегти" }));

      const paramSet = invoked.mock.calls.find(
        ([cmd, payload]) => cmd === "send_bytes" && (payload as { bytes: number[] }).bytes[7] === ParamSet.MSG_ID,
      );
      expect(paramSet).toBeDefined();
      const bytes = (paramSet![1] as { bytes: number[] }).bytes;
      const nameBytes = bytes.slice(16, 16 + 16);
      const nullIndex = nameBytes.indexOf(0);
      expect(String.fromCharCode(...nameBytes.slice(0, nullIndex === -1 ? undefined : nullIndex))).toBe("RC7_OPTION");
    });
  });
});
