import type { CommandLong } from "mavlink-mappings/dist/lib/common";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArduPilotSetupHeader } from "./ArduPilotSetupHeader";
import { ArduPilotSetupSidebar, type ArduPilotSetupSection } from "./ArduPilotSetupSidebar";
import { AccelCalSection } from "./AccelCalSection";
import { BatteryConfigSection } from "./BatteryConfigSection";
import { BATTERY_PARAM_NAMES } from "./batteryParams";
import { CompassCalSection } from "./CompassCalSection";
import { EscCalSection } from "./EscCalSection";
import { MotorsServosSection } from "./MotorsServosSection";
import { ParametersPanel } from "./ParametersPanel";
import { allPidCandidateNames, pidConfigForVehicleFolder } from "./pidGroups";
import { PidTuneSection } from "./PidTuneSection";
import { RcCalSection } from "./RcCalSection";
import { RC_SETUP_PARAM_NAMES } from "./rcSetupParams";
import { OsdSetupSection } from "./OsdSetupSection";
import { allOsdParamNames } from "./osdSetupParams";
import { RcSetupSection } from "./RcSetupSection";
import { TelemetrySection } from "./TelemetrySection";
import { VehicleStatusBar } from "./VehicleStatusBar";
import { decodeMessage, encodePacket } from "../../mavlink/codec/codec";
import { VERIFIED_FRAME_PRESETS } from "../../mavlink/frameDiagrams/frameDiagrams";
import { MavlinkFramer } from "../../mavlink/framer/framer";
import {
  decodeFtpNakError,
  decodeFtpPayload,
  encodeFtpPayload,
  unpackParamPck,
  type FtpPayloadHeader,
} from "../../mavlink/mavFtpCodec/mavFtpCodec";
import { buildParamSetPacket, paramValueToWireBits, paramWireBitsToValue, readParamValueBits } from "../../mavlink/paramValueCodec/paramValueCodec";
import {
  AccelcalVehiclePos,
  AccelcalVehiclePosCommand,
  Attitude,
  CommandAck,
  ComponentArmDisarmCommand,
  DoAcceptMagCalCommand,
  DoCancelMagCalCommand,
  DoMotorTestCommand,
  DoSetServoCommand,
  DoStartMagCalCommand,
  FileTransferProtocol,
  GlobalPositionInt,
  GpsRawInt,
  Heartbeat,
  MagCalProgress,
  MagCalReport,
  MavAutopilot,
  MavCmd,
  MavDataStream,
  MavFtpErr,
  MavFtpOpcode,
  MavModeFlag,
  MavParamType,
  MavState,
  MavType,
  MotorTestThrottleType,
  ParamRequestList,
  ParamRequestRead,
  ParamSet,
  ParamValue,
  PreflightCalibrationCommand,
  PreflightRebootShutdownCommand,
  RcChannels,
  RebootShutdownAction,
  RequestDataStream,
  ServoOutputRaw,
  SetMode,
  StatusText,
  SysStatus,
  VfrHud,
} from "../../mavlink/registry/registry";
import type { MavMode } from "../../mavlink/registry/registry";
import { vehicleFolderForMavType } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import {
  connectMock,
  connectSerial,
  connectUdp,
  disconnect,
  isTauriRuntime,
  listSerialPorts,
  onData,
  onStatus,
  sendBytes,
} from "../../services/mavlinkTransport/mavlinkTransport";
import type { SerialPortInfo } from "../../services/mavlinkTransport/types";
import { useMavlinkAccelCalStore } from "../../stores/mavlinkAccelCalStore/mavlinkAccelCalStore";
import { useMavlinkCompassCalStore } from "../../stores/mavlinkCompassCalStore/mavlinkCompassCalStore";
import { useMavlinkConnectionStore } from "../../stores/mavlinkConnectionStore/mavlinkConnectionStore";
import { useMavlinkParamDefaultsStore } from "../../stores/mavlinkParamDefaultsStore/mavlinkParamDefaultsStore";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import type { ParamEntry } from "../../stores/mavlinkParameterStore/types";
import { useMavlinkRcCalStore } from "../../stores/mavlinkRcCalStore/mavlinkRcCalStore";
import { useMavlinkStatusTextStore } from "../../stores/mavlinkStatusTextStore/mavlinkStatusTextStore";
import { useMavlinkTelemetryStore } from "../../stores/mavlinkTelemetryStore/mavlinkTelemetryStore";
import { useMavlinkVehicleStore } from "../../stores/mavlinkVehicleStore/mavlinkVehicleStore";

const BAUD_RATES = [9600, 38400, 57600, 115200, 921600];
const DEFAULT_UDP_PORT = 14550;
const HEARTBEAT_INTERVAL_MS = 1000;
// A full ArduCopter parameter list is 1000-1700+ PARAM_VALUE packets, which can arrive far
// faster than the UI could usefully re-render (each one updating the store would otherwise
// re-render the whole parameter table, freezing the tab during a bulk load). Incoming
// entries are buffered in a ref and flushed to the store in one batch on this interval
// instead, decoupling "how many packets arrived" from "how many times React re-renders."
const PARAM_FLUSH_INTERVAL_MS = 200;
// ArduPilot sends its own heartbeat at ~1Hz, so 2s is enough margin to see at least one on
// the right port/baud rate combination without making a wrong port take too long to skip.
const AUTO_CONNECT_TIMEOUT_MS = 2000;
// Our own identity as a "ground station" system on the link, following the same convention
// Mission Planner/QGC use - ArduPilot doesn't care what these are, but a GCS-failsafe setup
// on the vehicle does need *some* heartbeat arriving periodically from a non-vehicle system.
const GCS_SYSID = 255;
const GCS_COMPID = 190;
// The stream groups Mission Planner requests on connect: extended status (battery, sensor
// health), position, attitude (EXTRA1), and VFR HUD-style speed/altitude/throttle (EXTRA2).
// ArduPilot still honors this deprecated-but-universal message; the modern per-message
// SET_MESSAGE_INTERVAL alternative would need one request per message id instead of per group.
const REQUESTED_DATA_STREAMS = [
  MavDataStream.EXTENDED_STATUS,
  MavDataStream.POSITION,
  MavDataStream.EXTRA1,
  MavDataStream.EXTRA2,
  MavDataStream.RC_CHANNELS,
];
const DATA_STREAM_RATE_HZ = 4;
// Every ArduPilot board defines all of SERVO1_FUNCTION..SERVO16_FUNCTION regardless of how
// many outputs it physically has (unused ones just report Disabled) - 16 covers every real
// board without needing to guess the actual output count up front.
const SERVO_CHANNEL_COUNT = 16;
// The firmware's own auto-stop safety net (see DoMotorTestCommand.timeout) - independent of,
// and in addition to, the explicit throttle=0 command this app sends on release, in case that
// release command is ever lost.
const MOTOR_TEST_TIMEOUT_S = 3;
// ArduPilot's own virtual-file convention (not part of the general MAVLink FTP spec) for a
// packed parameter list - `withdefaults=1` makes it include each parameter's factory default
// alongside its current value (only when they differ - see mavFtpCodec.ts's unpackParamPck).
const PARAM_PCK_PATH = "@PARAM/param.pck?withdefaults=1";

/** Builds a full MAVLink v2 packet for one FTP payload - pure (no component state), so it's
 *  safe to call both from click handlers (fresh `vehicle`) and from the persistent onData
 *  effect closure below (via vehicleRef, since that closure can't see live render state). */
function buildFtpPacket(
  targetSysid: number,
  targetCompid: number,
  outSeq: number,
  header: FtpPayloadHeader,
  data?: Uint8Array,
): Uint8Array {
  const msg = new FileTransferProtocol();
  msg.targetSystem = targetSysid;
  msg.targetComponent = targetCompid;
  msg.payload = Array.from(encodeFtpPayload(header, data));
  return encodePacket(msg, { seq: outSeq, sysid: GCS_SYSID, compid: GCS_COMPID });
}

/** Resolves true if a heartbeat (any vehicle) arrives within `timeoutMs`, false otherwise. */
function waitForHeartbeat(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, timeoutMs);
    const unsubscribe = useMavlinkVehicleStore.subscribe((state) => {
      if (!state.vehicle) return;
      window.clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
  });
}

export function ArduPilotSetupView() {
  const { t } = useTranslation();
  const status = useMavlinkConnectionStore((s) => s.status);
  const detail = useMavlinkConnectionStore((s) => s.detail);
  const errorMessage = useMavlinkConnectionStore((s) => s.errorMessage);
  const bytesReceived = useMavlinkConnectionStore((s) => s.bytesReceived);
  const bytesSent = useMavlinkConnectionStore((s) => s.bytesSent);
  const setConnecting = useMavlinkConnectionStore((s) => s.setConnecting);
  const setConnected = useMavlinkConnectionStore((s) => s.setConnected);
  const setDisconnected = useMavlinkConnectionStore((s) => s.setDisconnected);
  const setError = useMavlinkConnectionStore((s) => s.setError);
  const addBytesReceived = useMavlinkConnectionStore((s) => s.addBytesReceived);
  const addBytesSent = useMavlinkConnectionStore((s) => s.addBytesSent);
  const vehicle = useMavlinkVehicleStore((s) => s.vehicle);
  const setVehicle = useMavlinkVehicleStore((s) => s.setVehicle);
  const armCommandAck = useMavlinkVehicleStore((s) => s.armCommandAck);
  const setArmCommandAck = useMavlinkVehicleStore((s) => s.setArmCommandAck);
  const resetVehicle = useMavlinkVehicleStore((s) => s.reset);
  const attitude = useMavlinkTelemetryStore((s) => s.attitude);
  const vfrHud = useMavlinkTelemetryStore((s) => s.vfrHud);
  const battery = useMavlinkTelemetryStore((s) => s.battery);
  const gps = useMavlinkTelemetryStore((s) => s.gps);
  const position = useMavlinkTelemetryStore((s) => s.position);
  const sensorHealth = useMavlinkTelemetryStore((s) => s.sensorHealth);
  const setAttitude = useMavlinkTelemetryStore((s) => s.setAttitude);
  const setVfrHud = useMavlinkTelemetryStore((s) => s.setVfrHud);
  const setBattery = useMavlinkTelemetryStore((s) => s.setBattery);
  const setGps = useMavlinkTelemetryStore((s) => s.setGps);
  const setPosition = useMavlinkTelemetryStore((s) => s.setPosition);
  const setSensorHealth = useMavlinkTelemetryStore((s) => s.setSensorHealth);
  const servoOutputs = useMavlinkTelemetryStore((s) => s.servoOutputs);
  const mergeServoOutputs = useMavlinkTelemetryStore((s) => s.mergeServoOutputs);
  const resetTelemetry = useMavlinkTelemetryStore((s) => s.reset);
  const statusTextMessages = useMavlinkStatusTextStore((s) => s.messages);
  const addStatusText = useMavlinkStatusTextStore((s) => s.addMessage);
  const resetStatusText = useMavlinkStatusTextStore((s) => s.reset);
  const setParams = useMavlinkParameterStore((s) => s.setParams);
  const resetParameters = useMavlinkParameterStore((s) => s.reset);
  const startParamDefaults = useMavlinkParamDefaultsStore((s) => s.start);
  const setParamDefaultsOpened = useMavlinkParamDefaultsStore((s) => s.setOpened);
  const setParamDefaultsProgress = useMavlinkParamDefaultsStore((s) => s.setProgress);
  const setParamDefaultsDone = useMavlinkParamDefaultsStore((s) => s.setDone);
  const setParamDefaultsError = useMavlinkParamDefaultsStore((s) => s.setError);
  const resetParamDefaults = useMavlinkParamDefaultsStore((s) => s.reset);
  const compassCalProgress = useMavlinkCompassCalStore((s) => s.progress);
  const compassCalReports = useMavlinkCompassCalStore((s) => s.reports);
  const compassCalLastCommandAck = useMavlinkCompassCalStore((s) => s.lastCommandAck);
  const setCompassCalProgress = useMavlinkCompassCalStore((s) => s.setProgress);
  const setCompassCalReport = useMavlinkCompassCalStore((s) => s.setReport);
  const setCompassCalLastCommandAck = useMavlinkCompassCalStore((s) => s.setLastCommandAck);
  const resetCompassCal = useMavlinkCompassCalStore((s) => s.reset);
  const accelCalActiveType = useMavlinkAccelCalStore((s) => s.activeCalType);
  const accelCalRequestedPosition = useMavlinkAccelCalStore((s) => s.requestedPosition);
  const accelCalConfirmedPositions = useMavlinkAccelCalStore((s) => s.confirmedPositions);
  const accelCalResult = useMavlinkAccelCalStore((s) => s.result);
  const accelCalLastCommandAck = useMavlinkAccelCalStore((s) => s.lastCommandAck);
  const startLevelCal = useMavlinkAccelCalStore((s) => s.startLevel);
  const startFullAccelCal = useMavlinkAccelCalStore((s) => s.startFull);
  const setAccelCalRequestedPosition = useMavlinkAccelCalStore((s) => s.setRequestedPosition);
  const confirmAccelCalPosition = useMavlinkAccelCalStore((s) => s.confirmPosition);
  const setAccelCalResult = useMavlinkAccelCalStore((s) => s.setResult);
  const setAccelCalLastCommandAck = useMavlinkAccelCalStore((s) => s.setLastCommandAck);
  const resetAccelCal = useMavlinkAccelCalStore((s) => s.reset);
  const rcCalLive = useMavlinkRcCalStore((s) => s.live);
  const rcCalChanCount = useMavlinkRcCalStore((s) => s.chanCount);
  const rcCalActive = useMavlinkRcCalStore((s) => s.active);
  const rcCalChannels = useMavlinkRcCalStore((s) => s.channels);
  const rcCalLastCommandAck = useMavlinkRcCalStore((s) => s.lastCommandAck);
  const startRcCal = useMavlinkRcCalStore((s) => s.start);
  const observeRcCal = useMavlinkRcCalStore((s) => s.observe);
  const toggleRcCalReversed = useMavlinkRcCalStore((s) => s.toggleReversed);
  const setRcCalLastCommandAck = useMavlinkRcCalStore((s) => s.setLastCommandAck);
  const stopRcCal = useMavlinkRcCalStore((s) => s.stop);
  const resetRcCal = useMavlinkRcCalStore((s) => s.reset);

  const [mode, setMode] = useState<"serial" | "udp">("serial");
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [baudRate, setBaudRate] = useState(BAUD_RATES[2]!);
  const [udpPort, setUdpPort] = useState(DEFAULT_UDP_PORT);
  const [udpHost, setUdpHost] = useState("");
  const [scanningPort, setScanningPort] = useState<string | null>(null);
  const [scanningBaud, setScanningBaud] = useState<number | null>(null);
  const [devFramePresetKey, setDevFramePresetKey] = useState(VERIFIED_FRAME_PRESETS[1]!.key); // Quad X
  const [activeSection, setActiveSection] = useState<ArduPilotSetupSection>("telemetry");

  const framerRef = useRef(new MavlinkFramer());
  const outgoingSeqRef = useRef(0);
  const streamsRequestedRef = useRef(false);
  // Incoming PARAM_VALUE decodes land here first, then get flushed to the store in one
  // batch on an interval (see PARAM_FLUSH_INTERVAL_MS) rather than one store update - and
  // one full-table React re-render - per packet.
  const pendingParamsRef = useRef<Map<string, ParamEntry>>(new Map());
  const pendingParamCountRef = useRef<number | null>(null);
  // PREFLIGHT_CALIBRATION is shared by accel cal and RC cal (see registry.ts) - its CommandAck
  // carries no field identifying which sub-calibration it answers, so this tracks whichever
  // was sent most recently to route the next ack to the right store.
  const pendingCalibrationKindRef = useRef<"accel" | "rc" | null>(null);
  // The in-progress param.pck FTP download's session id and accumulated burst-read chunks
  // (offset order, see the FileTransferProtocol.MSG_ID case below) - null when no download is
  // active. A plain ref, not store state, since react-render doesn't need to see every chunk.
  const ftpSessionRef = useRef<{ session: number; chunks: Uint8Array[]; bytesReceived: number } | null>(null);
  // The FTP payload's own seq_number field - a separate counter from outgoingSeqRef's MAVLink
  // packet seq (the FTP spec's sequence numbering is per sub-protocol, not per MAVLink packet).
  const ftpSeqRef = useRef(0);
  // Mirrors `vehicle` for the persistent onData effect closure below, which can't see fresh
  // render-scope state (its own dependency array only re-subscribes on things like `status`,
  // not on every heartbeat-driven `vehicle` update - see buildFtpPacket's comment for why).
  const vehicleRef = useRef(vehicle);

  useEffect(() => {
    vehicleRef.current = vehicle;
  }, [vehicle]);

  useEffect(() => {
    let cancelled = false;
    let unlistenData: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

    // Sends one FTP request packet, reading `vehicle` from vehicleRef (this closure is set up
    // once per effect run, not per render - see vehicleRef's own comment above).
    function sendFtp(opcode: MavFtpOpcode, opts: { session?: number; offset?: number; data?: Uint8Array } = {}) {
      const v = vehicleRef.current;
      if (!v) return;
      const ftpSeq = ftpSeqRef.current;
      ftpSeqRef.current = (ftpSeq + 1) % 0x10000;
      const outSeq = outgoingSeqRef.current;
      outgoingSeqRef.current = (outSeq + 1) % 256;
      const packet = buildFtpPacket(
        v.sysid,
        v.compid,
        outSeq,
        {
          seqNumber: ftpSeq,
          session: opts.session ?? 0,
          opcode,
          size: opts.data?.length ?? 0,
          reqOpcode: MavFtpOpcode.NONE,
          burstComplete: false,
          offset: opts.offset ?? 0,
        },
        opts.data,
      );
      sendBytes(packet)
        .then(() => addBytesSent(packet.length))
        .catch(() => {
          // Best-effort - a lost TERMINATESESSION just leaves an idle session on the vehicle
          // (it'll time out on its own); a lost BURSTREADFILE request stalls the download,
          // surfaced to the user as "stuck" rather than a hard error since there's no good
          // local signal to distinguish that from a slow vehicle.
        });
    }

    // Unpacks the fully-downloaded param.pck bytes and records {name -> default} for every
    // entry (falling back to the entry's own current value when no distinct default was sent -
    // see mavFtpCodec.ts's unpackParamPck comment on why ArduPilot omits those).
    function finishParamDefaultsDownload() {
      const session = ftpSessionRef.current;
      if (!session) return;
      ftpSessionRef.current = null;
      try {
        const totalLength = session.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let writeOffset = 0;
        for (const chunk of session.chunks) {
          combined.set(chunk, writeOffset);
          writeOffset += chunk.length;
        }
        const { entries } = unpackParamPck(combined);
        const paramDefaults: Record<string, number> = {};
        for (const entry of entries) paramDefaults[entry.name] = entry.default ?? entry.value;
        setParamDefaultsDone(paramDefaults);
      } catch (err) {
        setParamDefaultsError(err instanceof Error ? err.message : String(err));
      }
    }

    void onData((bytes) => {
      addBytesReceived(bytes.length);
      for (const packet of framerRef.current.push(bytes)) {
        const now = Date.now();
        // A real link often carries more than just the flight controller's own traffic - a
        // companion computer, a telemetry-bridge relay, or another GCS can all heartbeat and
        // (for a companion computer especially) send their own SYS_STATUS/GPS_RAW_INT-shaped
        // messages on the same wire. Once a vehicle's sysid is known (via a real ArduPilot
        // heartbeat, see the Heartbeat case below), every other system's packets are ignored
        // outright rather than being allowed to overwrite the display with unrelated data.
        if (packet.msgId !== Heartbeat.MSG_ID && vehicleRef.current && packet.sysid !== vehicleRef.current.sysid) {
          continue;
        }
        switch (packet.msgId) {
          case Heartbeat.MSG_ID: {
            const hb = packet.message as Heartbeat;
            // MAV_AUTOPILOT_INVALID is the standard convention a non-flight-controller system
            // (companion computer, telemetry relay, another GCS) uses to identify its own
            // heartbeat as "not an autopilot" - real ArduPilot firmware always reports
            // ARDUPILOTMEGA here (confirmed against this app's own mock simulator). Any other
            // system's heartbeat is ignored rather than being treated as "the vehicle."
            if (hb.autopilot !== MavAutopilot.ARDUPILOTMEGA) break;
            setVehicle({
              sysid: packet.sysid,
              compid: packet.compid,
              type: hb.type,
              autopilot: hb.autopilot,
              armed: (hb.baseMode & MavModeFlag.SAFETY_ARMED) !== 0,
              systemStatus: hb.systemStatus,
              customMode: hb.customMode,
              lastHeartbeatAt: now,
            });
            break;
          }
          case Attitude.MSG_ID: {
            const msg = packet.message as Attitude;
            setAttitude({ rollRad: msg.roll, pitchRad: msg.pitch, yawRad: msg.yaw, updatedAt: now });
            break;
          }
          case VfrHud.MSG_ID: {
            const msg = packet.message as VfrHud;
            setVfrHud({
              airspeed: msg.airspeed,
              groundspeed: msg.groundspeed,
              headingDeg: msg.heading,
              throttlePercent: msg.throttle,
              altitudeM: msg.alt,
              climbMs: msg.climb,
              updatedAt: now,
            });
            break;
          }
          case SysStatus.MSG_ID: {
            const msg = packet.message as SysStatus;
            setBattery({
              voltageV: msg.voltageBattery / 1000,
              currentA: msg.currentBattery >= 0 ? msg.currentBattery / 100 : null,
              remainingPercent: msg.batteryRemaining >= 0 ? msg.batteryRemaining : null,
              updatedAt: now,
            });
            setSensorHealth({
              present: msg.onboardControlSensorsPresent,
              enabled: msg.onboardControlSensorsEnabled,
              health: msg.onboardControlSensorsHealth,
              updatedAt: now,
            });
            break;
          }
          case StatusText.MSG_ID: {
            const msg = packet.message as StatusText;
            addStatusText({ severity: msg.severity, text: msg.text, receivedAt: now });
            break;
          }
          case GpsRawInt.MSG_ID: {
            const msg = packet.message as GpsRawInt;
            setGps({ fixType: msg.fixType, satellitesVisible: msg.satellitesVisible, updatedAt: now });
            break;
          }
          case GlobalPositionInt.MSG_ID: {
            const msg = packet.message as GlobalPositionInt;
            setPosition({ lat: msg.lat / 1e7, lon: msg.lon / 1e7, relativeAltM: msg.relativeAlt / 1000, updatedAt: now });
            break;
          }
          case ServoOutputRaw.MSG_ID: {
            const msg = packet.message as ServoOutputRaw;
            // `port` groups outputs in banks of 8 (standard MAVLink convention, matching
            // ArduPilot's MAIN/AUX split): port 0 carries channels 1-8, port 1 carries 9-16.
            const base = msg.port === 1 ? 8 : 0;
            const raws = [
              msg.servo1Raw,
              msg.servo2Raw,
              msg.servo3Raw,
              msg.servo4Raw,
              msg.servo5Raw,
              msg.servo6Raw,
              msg.servo7Raw,
              msg.servo8Raw,
            ];
            const update: Record<number, number> = {};
            raws.forEach((pwm, i) => {
              update[base + i + 1] = pwm;
            });
            mergeServoOutputs(update);
            break;
          }
          case RcChannels.MSG_ID: {
            const msg = packet.message as RcChannels;
            const raws = [
              msg.chan1Raw,
              msg.chan2Raw,
              msg.chan3Raw,
              msg.chan4Raw,
              msg.chan5Raw,
              msg.chan6Raw,
              msg.chan7Raw,
              msg.chan8Raw,
              msg.chan9Raw,
              msg.chan10Raw,
              msg.chan11Raw,
              msg.chan12Raw,
              msg.chan13Raw,
              msg.chan14Raw,
              msg.chan15Raw,
              msg.chan16Raw,
            ];
            const update: Record<number, number> = {};
            // UINT16_MAX marks an unused channel (confirmed against MAVLink's own common.xml),
            // not 0 - skipped rather than fed into the cal store as a bogus captured value.
            raws.forEach((raw, i) => {
              if (raw !== 0xffff) update[i + 1] = raw;
            });
            observeRcCal(update, msg.chancount);
            break;
          }
          case MagCalProgress.MSG_ID: {
            const msg = packet.message as MagCalProgress;
            setCompassCalProgress({
              compassId: msg.compassId,
              calMask: msg.calMask,
              calStatus: msg.calStatus,
              attempt: msg.attempt,
              completionPct: msg.completionPct,
              completionMask: Array.from(msg.completionMask),
              updatedAt: now,
            });
            break;
          }
          case MagCalReport.MSG_ID: {
            const msg = packet.message as MagCalReport;
            setCompassCalReport({
              compassId: msg.compassId,
              calMask: msg.calMask,
              calStatus: msg.calStatus,
              fitness: msg.fitness,
              offset: { x: msg.ofsX, y: msg.ofsY, z: msg.ofsZ },
              autosaved: msg.autosaved !== 0,
              updatedAt: now,
            });
            break;
          }
          case CommandAck.MSG_ID: {
            const msg = packet.message as CommandAck;
            // Only the mag-cal and accel-cal commands are surfaced here - a NACK on any of
            // them (e.g. DENIED because a compass/accelerometer is unhealthy) would otherwise
            // look like nothing happened at all, since no further progress message ever
            // arrives in that case. `command` is a plain uint16_t on the wire (not typed as
            // MavCmd), hence the cast.
            const command = msg.command as MavCmd;
            if (command === MavCmd.DO_START_MAG_CAL || command === MavCmd.DO_ACCEPT_MAG_CAL || command === MavCmd.DO_CANCEL_MAG_CAL) {
              setCompassCalLastCommandAck({ command, result: msg.result });
            } else if (command === MavCmd.PREFLIGHT_CALIBRATION) {
              if (pendingCalibrationKindRef.current === "rc") setRcCalLastCommandAck({ command, result: msg.result });
              else setAccelCalLastCommandAck({ command, result: msg.result });
            } else if (command === MavCmd.COMPONENT_ARM_DISARM) {
              // A DENIED/TEMPORARILY_REJECTED result here is exactly a failed pre-arm check -
              // real ArduPilot also sends the human-readable reason as a separate STATUSTEXT,
              // which this app doesn't decode yet (see the pre-arm-check status section this
              // feature is meant to be followed by) - this ack is the minimum viable feedback
              // ("it didn't work") until that lands.
              setArmCommandAck({ result: msg.result });
            }
            break;
          }
          // Unlike every other COMMAND_LONG this app deals with, ACCELCAL_VEHICLE_POS is sent
          // BY THE VEHICLE (not just to it) - it's how the vehicle tells the GCS which of the 6
          // positions to move to next during a full accel cal (see registry.ts's export
          // comment, verified against MAVLink's own ardupilotmega.xml).
          case AccelcalVehiclePosCommand.MSG_ID: {
            const command = (packet.message as CommandLong).command as MavCmd;
            if (command === MavCmd.ACCELCAL_VEHICLE_POS) {
              const posCmd = decodeMessage(AccelcalVehiclePosCommand, packet.payload);
              // `position` is a plain uint32 getter on the wire (not typed as AccelcalVehiclePos) - the
              // explicit type annotation (not a cast) is what satisfies both the assignment and the
              // comparison below without eslint flagging either as redundant/unsafe.
              const position: AccelcalVehiclePos = posCmd.position;
              if (position === AccelcalVehiclePos.SUCCESS) setAccelCalResult("success");
              else if (position === AccelcalVehiclePos.FAILED) setAccelCalResult("failed");
              else setAccelCalRequestedPosition(position);
            }
            break;
          }
          case ParamValue.MSG_ID: {
            const msg = packet.message as ParamValue;
            // param_value is only meaningfully decodable via the generic float reader for
            // REAL32 params - other types need the raw bits reinterpreted (see
            // paramValueCodec.ts for why msg.paramValue itself can't be trusted here).
            const bits = readParamValueBits(packet.payload);
            // Buffered, not written to the store directly - see pendingParamsRef above.
            pendingParamsRef.current.set(msg.paramId, {
              name: msg.paramId,
              value: paramWireBitsToValue(bits, msg.paramType),
              type: msg.paramType,
              index: msg.paramIndex,
              updatedAt: now,
              dirty: false,
            });
            pendingParamCountRef.current = msg.paramCount;
            break;
          }
          case FileTransferProtocol.MSG_ID: {
            const ftpMsg = decodeMessage(FileTransferProtocol, packet.payload);
            const { header, data } = decodeFtpPayload(ftpMsg.payload);
            if (header.opcode === MavFtpOpcode.NAK) {
              const errCode = decodeFtpNakError(data);
              // Some firmware versions signal the end of a burst read with a NAK/EOF instead of
              // ever setting burst_complete=1 on the last ACK - treated as a normal completion,
              // not a failure.
              if (header.reqOpcode === MavFtpOpcode.BURSTREADFILE && errCode === MavFtpErr.EOF && ftpSessionRef.current) {
                finishParamDefaultsDownload();
                sendFtp(MavFtpOpcode.TERMINATESESSION, { session: header.session });
              } else if (header.reqOpcode === MavFtpOpcode.OPENFILERO || header.reqOpcode === MavFtpOpcode.BURSTREADFILE) {
                setParamDefaultsError(`FTP error ${errCode}`);
                ftpSessionRef.current = null;
              }
            } else if (header.opcode === MavFtpOpcode.ACK && header.reqOpcode === MavFtpOpcode.OPENFILERO) {
              // OPEN_FILE_RO's ACK carries the new session id in the header and the file's real
              // size as a little-endian uint32 in its data - confirmed against mavlink.io's FTP
              // service spec.
              const totalBytes = data.length >= 4 ? new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, true) : 0;
              ftpSessionRef.current = { session: header.session, chunks: [], bytesReceived: 0 };
              setParamDefaultsOpened(totalBytes);
              sendFtp(MavFtpOpcode.BURSTREADFILE, { session: header.session, offset: 0 });
            } else if (header.opcode === MavFtpOpcode.ACK && header.reqOpcode === MavFtpOpcode.BURSTREADFILE) {
              const session = ftpSessionRef.current;
              // Burst-read chunks are assumed to arrive in offset order with nothing dropped -
              // true for the local serial/UDP links this app targets, and matches the same
              // "no exotic retry/reorder handling" scope already accepted for every other
              // protocol flow in this file (mag cal, accel cal, RC cal).
              if (session && session.session === header.session) {
                session.chunks.push(data);
                session.bytesReceived += data.length;
                setParamDefaultsProgress(session.bytesReceived);
                if (header.burstComplete) {
                  finishParamDefaultsDownload();
                  sendFtp(MavFtpOpcode.TERMINATESESSION, { session: header.session });
                }
              }
            }
            break;
          }
          default:
            break;
        }
      }
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unlistenData = unlisten;
    });

    void onStatus((s) => {
      if (s.kind === "connected") setConnected(s.detail);
      else if (s.kind === "disconnected") {
        setDisconnected();
        resetVehicle();
        resetTelemetry();
        resetStatusText();
        resetParameters();
        resetCompassCal();
        resetAccelCal();
        resetRcCal();
        resetParamDefaults();
        pendingParamsRef.current.clear();
        pendingParamCountRef.current = null;
        ftpSessionRef.current = null;
        streamsRequestedRef.current = false;
      } else {
        setError(s.message);
        resetVehicle();
        resetTelemetry();
        resetStatusText();
        resetParameters();
        resetCompassCal();
        resetAccelCal();
        resetRcCal();
        resetParamDefaults();
        pendingParamsRef.current.clear();
        pendingParamCountRef.current = null;
        ftpSessionRef.current = null;
        streamsRequestedRef.current = false;
      }
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unlistenStatus = unlisten;
    });

    return () => {
      cancelled = true;
      unlistenData?.();
      unlistenStatus?.();
    };
  }, [
    addBytesReceived,
    addBytesSent,
    setConnected,
    setDisconnected,
    setError,
    setVehicle,
    setArmCommandAck,
    resetVehicle,
    setAttitude,
    setVfrHud,
    setBattery,
    setGps,
    setPosition,
    setSensorHealth,
    mergeServoOutputs,
    resetTelemetry,
    addStatusText,
    resetStatusText,
    resetParameters,
    resetCompassCal,
    setCompassCalProgress,
    setCompassCalReport,
    setCompassCalLastCommandAck,
    resetAccelCal,
    setAccelCalLastCommandAck,
    setAccelCalRequestedPosition,
    setAccelCalResult,
    resetRcCal,
    observeRcCal,
    setRcCalLastCommandAck,
    setParamDefaultsOpened,
    setParamDefaultsProgress,
    setParamDefaultsDone,
    setParamDefaultsError,
    resetParamDefaults,
  ]);

  // Flushes buffered PARAM_VALUE decodes (see pendingParamsRef above) to the store in one
  // batch, at most every PARAM_FLUSH_INTERVAL_MS - keeps a full 1000+ parameter load from
  // triggering a full-table re-render per packet, which is what was freezing the tab.
  useEffect(() => {
    if (status !== "connected") return;

    const id = window.setInterval(() => {
      if (pendingParamsRef.current.size === 0) return;
      const entries = Array.from(pendingParamsRef.current.values());
      pendingParamsRef.current.clear();
      const expectedCount = pendingParamCountRef.current ?? useMavlinkParameterStore.getState().expectedCount ?? entries.length;
      setParams(entries, expectedCount);
    }, PARAM_FLUSH_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [status, setParams]);

  // A GCS is expected to send its own periodic heartbeat - some vehicles use its absence to
  // trigger a GCS-failsafe. Best-effort: a single failed send doesn't flip the whole
  // connection to an error state, it just tries again next tick.
  useEffect(() => {
    if (status !== "connected") return;

    function sendHeartbeat() {
      const hb = new Heartbeat();
      hb.type = MavType.GCS;
      hb.autopilot = MavAutopilot.INVALID;
      hb.baseMode = 0 as MavModeFlag;
      hb.customMode = 0;
      hb.systemStatus = MavState.ACTIVE;
      hb.mavlinkVersion = 3;

      const seq = outgoingSeqRef.current;
      outgoingSeqRef.current = (seq + 1) % 256;
      const packet = encodePacket(hb, { seq, sysid: GCS_SYSID, compid: GCS_COMPID });
      sendBytes(packet)
        .then(() => addBytesSent(packet.length))
        .catch(() => {
          // Best-effort - the next tick will just try again.
        });
    }

    sendHeartbeat();
    const id = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [status, addBytesSent]);

  // Ask the vehicle to start streaming telemetry once we know who it is (its sysid/compid,
  // learned from its own heartbeat) - ArduPilot doesn't push ATTITUDE/VFR_HUD/SYS_STATUS/etc.
  // at a useful rate to a GCS that never asked. Sent once per connection (guarded by the ref,
  // reset on disconnect/error) rather than repeated on every heartbeat.
  useEffect(() => {
    if (status !== "connected" || !vehicle || streamsRequestedRef.current) return;
    streamsRequestedRef.current = true;

    for (const streamId of REQUESTED_DATA_STREAMS) {
      const req = new RequestDataStream();
      req.targetSystem = vehicle.sysid;
      req.targetComponent = vehicle.compid;
      req.reqStreamId = streamId;
      req.reqMessageRate = DATA_STREAM_RATE_HZ;
      req.startStop = 1;

      const seq = outgoingSeqRef.current;
      outgoingSeqRef.current = (seq + 1) % 256;
      const packet = encodePacket(req, { seq, sysid: GCS_SYSID, compid: GCS_COMPID });
      sendBytes(packet)
        .then(() => addBytesSent(packet.length))
        .catch(() => {
          // Best-effort - if this is lost, the vehicle simply won't stream that group.
        });
    }
  }, [status, vehicle, addBytesSent]);

  useEffect(() => {
    if (!isTauriRuntime()) return; // browser build - no OS serial access, nothing to list
    let cancelled = false;
    listSerialPorts()
      .then((found) => {
        if (cancelled) return;
        setPorts(found);
        setSelectedPort((prev) => prev || found[0]?.name || "");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [setError]);

  async function refreshPorts() {
    try {
      const found = await listSerialPorts();
      setPorts(found);
      setSelectedPort((prev) => (found.some((p) => p.name === prev) ? prev : (found[0]?.name ?? "")));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleConnect() {
    setConnecting();
    try {
      if (mode === "serial") {
        await connectSerial(selectedPort, baudRate);
      } else {
        await connectUdp(udpPort, udpHost);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleAutoConnect() {
    setConnecting();
    resetVehicle();
    resetTelemetry();
    resetStatusText();
    resetParameters();
    resetCompassCal();
    resetAccelCal();
    resetRcCal();
    resetParamDefaults();
    pendingParamsRef.current.clear();
    pendingParamCountRef.current = null;
    ftpSessionRef.current = null;
    // Try the currently-selected baud rate first (fast path when it's already right - same
    // speed as before), then fall back through the other standard rates per port. Without
    // this, a mismatched default baud (e.g. the header still on 57600 while the FC actually
    // talks at 115200) makes every port time out with no heartbeat, even the right one.
    const bauds = [baudRate, ...BAUD_RATES.filter((rate) => rate !== baudRate)];
    for (const port of ports) {
      for (const rate of bauds) {
        setScanningPort(port.name);
        setScanningBaud(rate);
        try {
          await connectSerial(port.name, rate);
        } catch {
          continue; // couldn't even open this one at this rate - try the next
        }

        const found = await waitForHeartbeat(AUTO_CONNECT_TIMEOUT_MS);
        if (found) {
          setSelectedPort(port.name);
          setBaudRate(rate);
          setScanningPort(null);
          setScanningBaud(null);
          return; // stay connected - onStatus already reflected "connected"
        }

        await disconnect().catch(() => {});
      }
    }
    setScanningPort(null);
    setScanningBaud(null);
    setError(t("ardupilotSetup.connect.autoConnectFailed"));
  }

  async function handleDisconnect() {
    try {
      await disconnect();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Starts an in-process simulated vehicle (see mockVehicleSimulator.ts) instead of a real
  // connection - lets the whole app be exercised without any real hardware, SITL, or even a
  // Tauri backend.
  async function handleConnectMockAs(vehicleType: MavType, copterFrame?: { frameClass: number; frameType: number }) {
    setConnecting();
    resetVehicle();
    resetTelemetry();
    resetStatusText();
    resetParameters();
    resetCompassCal();
    resetAccelCal();
    resetRcCal();
    resetParamDefaults();
    pendingParamsRef.current.clear();
    pendingParamCountRef.current = null;
    ftpSessionRef.current = null;
    try {
      await connectMock(vehicleType, copterFrame);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Defaults to a simulated Plane, matching this project's current real test hardware and the
  // features already built for it (servo mapping/test, compass cal).
  async function handleConnectMock() {
    await handleConnectMockAs(MavType.FIXED_WING);
  }

  // Simulated Copter (see MotorsCopterSection.tsx / frameDiagrams.ts) for exercising the
  // Copter half of Motors & Servos without real hardware - starts as whichever of the 6
  // verified frame class/type combos the header's frame-preset selector currently has picked.
  async function handleConnectMockCopter() {
    const preset = VERIFIED_FRAME_PRESETS.find((p) => p.key === devFramePresetKey) ?? VERIFIED_FRAME_PRESETS[1]!;
    await handleConnectMockAs(MavType.QUADROTOR, { frameClass: preset.frameClass, frameType: preset.frameType });
  }

  function sendGcsPacket(packet: Uint8Array) {
    sendBytes(packet)
      .then(() => addBytesSent(packet.length))
      .catch(() => {
        // Best-effort - the caller doesn't have a good recovery path for a single lost send.
      });
  }

  function nextSeq(): number {
    const seq = outgoingSeqRef.current;
    outgoingSeqRef.current = (seq + 1) % 256;
    return seq;
  }

  function handleLoadParameters() {
    if (!vehicle) return;
    const req = new ParamRequestList();
    req.targetSystem = vehicle.sysid;
    req.targetComponent = vehicle.compid;
    sendGcsPacket(encodePacket(req, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
  }

  // Opens the @PARAM/param.pck?withdefaults=1 virtual file over MAVLink FTP - the rest of the
  // download (BURSTREADFILE, unpacking, TERMINATESESSION) is driven from the FileTransferProtocol
  // response handling in the main onData effect above, since it has to react to whatever the
  // vehicle sends back.
  function handleLoadParamDefaults() {
    if (!vehicle) return;
    ftpSessionRef.current = null;
    ftpSeqRef.current = 0;
    startParamDefaults();
    const pathBytes = new TextEncoder().encode(PARAM_PCK_PATH);
    const ftpSeq = ftpSeqRef.current;
    ftpSeqRef.current += 1;
    const packet = buildFtpPacket(
      vehicle.sysid,
      vehicle.compid,
      nextSeq(),
      {
        seqNumber: ftpSeq,
        session: 0,
        opcode: MavFtpOpcode.OPENFILERO,
        size: pathBytes.length,
        reqOpcode: MavFtpOpcode.NONE,
        burstComplete: false,
        offset: 0,
      },
      pathBytes,
    );
    sendGcsPacket(packet);
  }

  // Re-requests only the specific indices that never arrived, by index rather than name (the
  // name isn't known for a missing param) - far cheaper than re-requesting the whole list,
  // and is exactly what a robust GCS is expected to do after a partial/lossy transfer.
  function handleRequestMissingParameters() {
    if (!vehicle) return;
    const { params, expectedCount } = useMavlinkParameterStore.getState();
    if (expectedCount === null) return;
    const receivedIndices = new Set(Object.values(params).map((p) => p.index));
    for (let index = 0; index < expectedCount; index++) {
      if (receivedIndices.has(index)) continue;
      const req = new ParamRequestRead();
      req.targetSystem = vehicle.sysid;
      req.targetComponent = vehicle.compid;
      req.paramId = "";
      req.paramIndex = index;
      sendGcsPacket(encodePacket(req, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
    }
  }

  function handleSetParam(name: string, value: number, type: MavParamType) {
    if (!vehicle) return;
    const msg = new ParamSet();
    msg.targetSystem = vehicle.sysid;
    msg.targetComponent = vehicle.compid;
    msg.paramId = name;
    msg.paramType = type;
    msg.paramValue = 0; // placeholder - buildParamSetPacket overwrites this with the real wire bits
    const wireBits = paramValueToWireBits(value, type);
    sendGcsPacket(buildParamSetPacket(msg, wireBits, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));

    const { params, expectedCount, setParam: storeSetParam } = useMavlinkParameterStore.getState();
    const existing = params[name];
    if (existing) {
      storeSetParam({ ...existing, value, dirty: true, updatedAt: Date.now() }, expectedCount ?? existing.index + 1);
    }
  }

  function handleStartCompassCal() {
    if (!vehicle) return;
    resetCompassCal();
    const cmd = new DoStartMagCalCommand(vehicle.sysid, vehicle.compid);
    cmd.magnetometersBitmask = 0; // 0 = every compass that's healthy enough to start
    cmd.retryOnFailure = 1;
    cmd.autosave = 0; // require an explicit Accept once fitness is known, rather than autosaving
    cmd.delay = 0;
    cmd.autoreboot = 0;
    sendGcsPacket(encodePacket(cmd, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
  }

  function handleAcceptCompassCal() {
    if (!vehicle) return;
    const cmd = new DoAcceptMagCalCommand(vehicle.sysid, vehicle.compid);
    cmd.magnetometersBitmask = 0;
    sendGcsPacket(encodePacket(cmd, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
  }

  function handleCancelCompassCal() {
    if (!vehicle) return;
    const cmd = new DoCancelMagCalCommand(vehicle.sysid, vehicle.compid);
    cmd.magnetometersBitmask = 0;
    sendGcsPacket(encodePacket(cmd, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
  }

  // One-shot board-level ("trim") calibration - unlike the full 6-position cal below, the
  // vehicle does this immediately with no position prompts, so its only feedback is the
  // COMMAND_ACK for this same PREFLIGHT_CALIBRATION command.
  function handleStartLevelCal() {
    if (!vehicle) return;
    pendingCalibrationKindRef.current = "accel";
    startLevelCal();
    const cmd = new PreflightCalibrationCommand(vehicle.sysid, vehicle.compid);
    cmd.accelerometer = 2; // PREFLIGHT_CALIBRATION_ACCELEROMETER_TRIM
    sendGcsPacket(encodePacket(cmd, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
  }

  function handleStartFullAccelCal() {
    if (!vehicle) return;
    pendingCalibrationKindRef.current = "accel";
    startFullAccelCal();
    const cmd = new PreflightCalibrationCommand(vehicle.sysid, vehicle.compid);
    cmd.accelerometer = 1; // PREFLIGHT_CALIBRATION_ACCELEROMETER_FULL
    sendGcsPacket(encodePacket(cmd, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
  }

  // Echoes the vehicle's own ACCELCAL_VEHICLE_POS command back to it once the user confirms
  // the vehicle is actually in the requested position - this is what tells the vehicle to
  // sample this position and move on to the next one (see registry.ts's export comment).
  function handleConfirmAccelCalPosition(position: number) {
    if (!vehicle) return;
    confirmAccelCalPosition(position);
    const cmd = new AccelcalVehiclePosCommand(vehicle.sysid, vehicle.compid);
    cmd.position = position;
    sendGcsPacket(encodePacket(cmd, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
  }

  // ArduPilot's accel-cal state machine has no MAVLink cancel command of its own (unlike mag
  // cal's explicit DO_CANCEL_MAG_CAL) - confirmed against ardupilotmega.xml, not assumed - so
  // "cancel" here is local-only - restarting a fresh attempt re-sends PREFLIGHT_CALIBRATION.
  function handleCancelAccelCal() {
    resetAccelCal();
  }

  // Sends PREFLIGHT_CALIBRATION(remoteControl=1) - real ArduPilot sets its internal RC
  // "calibrating" flag from this (see GCS_Common.cpp: `rc().calibrating(is_positive(param4))`),
  // which blocks arming until Save/Cancel clears it again. Unlike accel cal, there is no
  // further command handshake - min/max/trim are captured purely by watching RC_CHANNELS
  // (see mavlinkRcCalStore's observe()), which the app already requests via
  // MavDataStream.RC_CHANNELS regardless of whether this section is open.
  function handleStartRcCal() {
    if (!vehicle) return;
    pendingCalibrationKindRef.current = "rc";
    startRcCal();
    const cmd = new PreflightCalibrationCommand(vehicle.sysid, vehicle.compid);
    cmd.remoteControl = 1;
    sendGcsPacket(encodePacket(cmd, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
  }

  // Writes the captured range for every observed channel - RC{ch}_MIN/MAX/TRIM (INT16) and
  // RC{ch}_REVERSED (INT8), the same real, generic per-channel params every ArduPilot board
  // exposes (RC1_.. through RC16_.., confirmed against ArduCopter's own apm.pdef.xml) - typed
  // the same way as the already-verified SERVOx_MIN/MAX/TRIM/REVERSED output-side params,
  // since both are the same AP_Int16/AP_Int8 parameter classes in ArduPilot's own source.
  function handleSaveRcCal() {
    if (!vehicle) return;
    pendingCalibrationKindRef.current = "rc";
    for (const [channelKey, range] of Object.entries(rcCalChannels)) {
      handleSetParam(`RC${channelKey}_MIN`, range.min, MavParamType.INT16);
      handleSetParam(`RC${channelKey}_MAX`, range.max, MavParamType.INT16);
      handleSetParam(`RC${channelKey}_TRIM`, range.trim, MavParamType.INT16);
      handleSetParam(`RC${channelKey}_REVERSED`, range.reversed ? 1 : 0, MavParamType.INT8);
    }
    const cmd = new PreflightCalibrationCommand(vehicle.sysid, vehicle.compid);
    cmd.remoteControl = 0;
    sendGcsPacket(encodePacket(cmd, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
    stopRcCal();
  }

  function handleCancelRcCal() {
    if (!vehicle) return;
    pendingCalibrationKindRef.current = "rc";
    const cmd = new PreflightCalibrationCommand(vehicle.sysid, vehicle.compid);
    cmd.remoteControl = 0;
    sendGcsPacket(encodePacket(cmd, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
    stopRcCal();
  }

  // Requests exactly the params the Motors/Servos section needs (function + travel range per
  // output channel) by name rather than depending on the full parameter list being loaded
  // elsewhere - self-contained, and far cheaper than a full 1000+ param dump.
  function handleLoadServoOutputs() {
    if (!vehicle) return;
    for (let channel = 1; channel <= SERVO_CHANNEL_COUNT; channel++) {
      for (const suffix of ["FUNCTION", "MIN", "MAX", "TRIM"]) {
        const req = new ParamRequestRead();
        req.targetSystem = vehicle.sysid;
        req.targetComponent = vehicle.compid;
        req.paramId = `SERVO${channel}_${suffix}`;
        req.paramIndex = -1; // addressed by name, not index
        sendGcsPacket(encodePacket(req, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
      }
    }
  }

  function handleSetServoPwm(channel: number, pwm: number) {
    if (!vehicle) return;
    const cmd = new DoSetServoCommand(vehicle.sysid, vehicle.compid);
    cmd.instance = channel;
    cmd.pwm = pwm;
    sendGcsPacket(encodePacket(cmd, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
  }

  // Requests everything the Copter half of Motors & Servos needs: the vehicle's real motor
  // layout (FRAME_CLASS/FRAME_TYPE, see frameDiagrams.ts) plus each output channel's reverse
  // flag (SERVOx_REVERSED - a real, generic param every servo/motor output has, confirmed
  // against ArduCopter's own apm.pdef.xml: "Reverse servo operation... reverse this output
  // channel") - same self-contained by-name pattern as handleLoadServoOutputs above, rather
  // than depending on the full parameter list.
  function handleLoadMotorSetup() {
    if (!vehicle) return;
    for (const name of ["FRAME_CLASS", "FRAME_TYPE"]) {
      const req = new ParamRequestRead();
      req.targetSystem = vehicle.sysid;
      req.targetComponent = vehicle.compid;
      req.paramId = name;
      req.paramIndex = -1;
      sendGcsPacket(encodePacket(req, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
    }
    for (let channel = 1; channel <= SERVO_CHANNEL_COUNT; channel++) {
      const req = new ParamRequestRead();
      req.targetSystem = vehicle.sysid;
      req.targetComponent = vehicle.compid;
      req.paramId = `SERVO${channel}_REVERSED`;
      req.paramIndex = -1;
      sendGcsPacket(encodePacket(req, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
    }
  }

  // Requests every candidate PID/rate-controller param name for the connected vehicle's
  // family (see pidGroups.ts) - Plane's naming differs by firmware version, so both the
  // modern and legacy candidates are requested and the UI shows whichever one actually
  // responds, rather than this app guessing which scheme the vehicle runs.
  function handleLoadPidParams() {
    if (!vehicle) return;
    const config = pidConfigForVehicleFolder(vehicleFolderForMavType(vehicle.type));
    if (!config) return;
    for (const name of allPidCandidateNames(config)) {
      const req = new ParamRequestRead();
      req.targetSystem = vehicle.sysid;
      req.targetComponent = vehicle.compid;
      req.paramId = name;
      req.paramIndex = -1;
      sendGcsPacket(encodePacket(req, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
    }
  }

  // Requests the primary battery monitor's config params by name - see
  // BatteryConfigSection.tsx's BATTERY_PARAM_NAMES for the real param list.
  function handleLoadBatteryConfig() {
    if (!vehicle) return;
    for (const name of BATTERY_PARAM_NAMES) {
      const req = new ParamRequestRead();
      req.targetSystem = vehicle.sysid;
      req.targetComponent = vehicle.compid;
      req.paramId = name;
      req.paramIndex = -1;
      sendGcsPacket(encodePacket(req, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
    }
  }

  // Requests every OSD parameter by name - see osdSetupParams.ts for the real, generic
  // (not vehicle-specific) OSD_TYPE/OSD_UNITS/OSD_CHAN + per-screen element list, confirmed
  // against ArduCopter's own apm.pdef.xml.
  function handleLoadOsdSetup() {
    if (!vehicle) return;
    for (const name of allOsdParamNames()) {
      const req = new ParamRequestRead();
      req.targetSystem = vehicle.sysid;
      req.targetComponent = vehicle.compid;
      req.paramId = name;
      req.paramIndex = -1;
      sendGcsPacket(encodePacket(req, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
    }
  }

  // Requests the flight-mode-switch and per-channel option params by name - see
  // rcSetupParams.ts for the real, generic (not vehicle-specific) param list.
  function handleLoadRcSetup() {
    if (!vehicle) return;
    for (const name of RC_SETUP_PARAM_NAMES) {
      const req = new ParamRequestRead();
      req.targetSystem = vehicle.sysid;
      req.targetComponent = vehicle.compid;
      req.paramId = name;
      req.paramIndex = -1;
      sendGcsPacket(encodePacket(req, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
    }
  }

  // Reboots the flight controller - needed for RebootRequired params (e.g. FRAME_CLASS/
  // FRAME_TYPE) to actually take effect; PARAM_SET itself already wrote the new value to the
  // vehicle's persistent storage immediately, so there's no separate "save" step, only this.
  function handleReboot() {
    if (!vehicle) return;
    const cmd = new PreflightRebootShutdownCommand(vehicle.sysid, vehicle.compid);
    cmd.autopilot = RebootShutdownAction.REBOOT;
    sendGcsPacket(encodePacket(cmd, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
  }

  // Sets ESC_CALIBRATION=3 ("Auto") and reboots - the firmware handles the whole passthrough
  // sequence itself on the next boot (see EscCalSection.tsx's comment), so no further protocol
  // interaction is needed after this.
  function handleStartEscCalibration() {
    handleSetParam("ESC_CALIBRATION", 3, MavParamType.INT8);
    handleReboot();
  }

  // Press-and-hold motor identification test (the Copter counterpart to handleSetServoPwm's
  // Plane surface test) - `throttlePercent` is 0 on release, matching the deflect/return-to-
  // trim convention already established for servos.
  function handleTestMotor(instance: number, throttlePercent: number) {
    if (!vehicle) return;
    const cmd = new DoMotorTestCommand(vehicle.sysid, vehicle.compid);
    cmd.instance = instance;
    cmd.throttleType = MotorTestThrottleType.THROTTLE_PERCENT;
    cmd.throttle = throttlePercent;
    cmd.timeout = MOTOR_TEST_TIMEOUT_S;
    cmd.motorCount = 1;
    cmd.testOrder = 0; // DEFAULT - board-defined, not remapped (see frameDiagrams.ts)
    sendGcsPacket(encodePacket(cmd, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
  }

  // Arm/disarm - a normal (non-forced) request, still subject to the vehicle's own pre-arm
  // checks (see registry.ts's export comment on why `force` is never set). The result arrives
  // as a COMMAND_ACK, handled in the onData effect above and surfaced via armCommandAck.
  function handleSetArmed(armed: boolean) {
    if (!vehicle) return;
    const cmd = new ComponentArmDisarmCommand(vehicle.sysid, vehicle.compid);
    cmd.arm = armed ? 1 : 0;
    cmd.force = 0;
    sendGcsPacket(encodePacket(cmd, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
  }

  // Flight-mode change - see registry.ts's SET_MODE comment for why this is a plain message
  // (not a COMMAND_LONG) and never gets a COMMAND_ACK; the UI confirms it took by watching
  // vehicle.customMode update on the vehicle's own next heartbeat instead.
  function handleSetMode(customMode: number) {
    if (!vehicle) return;
    const msg = new SetMode();
    msg.targetSystem = vehicle.sysid;
    msg.baseMode = MavModeFlag.CUSTOM_MODE_ENABLED as unknown as MavMode;
    msg.customMode = customMode;
    sendGcsPacket(encodePacket(msg, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
  }

  const isConnected = status === "connected";

  return (
    <div className="ardupilot-setup-theme flex h-svh flex-col overflow-hidden">
      <ArduPilotSetupHeader
        liveAvailable={isTauriRuntime()}
        mode={mode}
        setMode={setMode}
        ports={ports}
        selectedPort={selectedPort}
        setSelectedPort={setSelectedPort}
        baudRate={baudRate}
        setBaudRate={setBaudRate}
        baudRates={BAUD_RATES}
        udpPort={udpPort}
        setUdpPort={setUdpPort}
        udpHost={udpHost}
        setUdpHost={setUdpHost}
        status={status}
        detail={detail}
        errorMessage={errorMessage}
        scanningPort={scanningPort}
        scanningBaud={scanningBaud}
        bytesReceived={bytesReceived}
        bytesSent={bytesSent}
        onRefreshPorts={() => void refreshPorts()}
        onAutoConnect={() => void handleAutoConnect()}
        onConnect={() => void handleConnect()}
        onDisconnect={() => void handleDisconnect()}
        onReboot={handleReboot}
        onDevMode={() => void handleConnectMock()}
        onDevModeCopter={() => void handleConnectMockCopter()}
        devFramePresetKey={devFramePresetKey}
        setDevFramePresetKey={setDevFramePresetKey}
      />

      <VehicleStatusBar
        vehicle={vehicle}
        battery={battery}
        gps={gps}
        armCommandAck={armCommandAck}
        onArm={() => handleSetArmed(true)}
        onDisarm={() => handleSetArmed(false)}
        onSetMode={handleSetMode}
      />

      <div className="flex flex-1 overflow-hidden">
        <ArduPilotSetupSidebar activeSection={activeSection} onSelect={setActiveSection} />

        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-4">
          {!isConnected ? (
            <div className="mx-auto flex max-w-md flex-col items-center gap-2 pt-12 text-center">
              <h2 className="text-lg font-bold">{t("ardupilotSetup.heading")}</h2>
              <p className="text-sm text-muted-foreground">{t("ardupilotSetup.description")}</p>
              <p className="text-xs text-muted-foreground">{t("ardupilotSetup.notConnected")}</p>
            </div>
          ) : activeSection === "telemetry" ? (
            <TelemetrySection
              vehicle={vehicle}
              attitude={attitude}
              vfrHud={vfrHud}
              battery={battery}
              gps={gps}
              position={position}
              sensorHealth={sensorHealth}
              statusTextMessages={statusTextMessages}
              onNavigateToSection={setActiveSection}
            />
          ) : activeSection === "parameters" ? (
            <ParametersPanel
              vehicleType={vehicle?.type ?? MavType.GENERIC}
              onLoadParameters={handleLoadParameters}
              onRequestMissing={handleRequestMissingParameters}
              onSetParam={handleSetParam}
              onLoadParamDefaults={handleLoadParamDefaults}
            />
          ) : activeSection === "compassCal" ? (
            <CompassCalSection
              progress={compassCalProgress}
              reports={compassCalReports}
              lastCommandAck={compassCalLastCommandAck}
              onStart={handleStartCompassCal}
              onAccept={handleAcceptCompassCal}
              onCancel={handleCancelCompassCal}
              onReboot={handleReboot}
            />
          ) : activeSection === "accelCal" ? (
            <AccelCalSection
              activeCalType={accelCalActiveType}
              requestedPosition={accelCalRequestedPosition}
              confirmedPositions={accelCalConfirmedPositions}
              result={accelCalResult}
              lastCommandAck={accelCalLastCommandAck}
              onStartLevel={handleStartLevelCal}
              onStartFull={handleStartFullAccelCal}
              onConfirmPosition={handleConfirmAccelCalPosition}
              onCancel={handleCancelAccelCal}
            />
          ) : activeSection === "rcCal" ? (
            <RcCalSection
              live={rcCalLive}
              chanCount={rcCalChanCount}
              active={rcCalActive}
              channels={rcCalChannels}
              lastCommandAck={rcCalLastCommandAck}
              onStart={handleStartRcCal}
              onSave={handleSaveRcCal}
              onCancel={handleCancelRcCal}
              onToggleReversed={toggleRcCalReversed}
            />
          ) : activeSection === "rcSetup" ? (
            <RcSetupSection
              vehicleType={vehicle?.type ?? MavType.GENERIC}
              live={rcCalLive}
              onLoad={handleLoadRcSetup}
              onSetParam={handleSetParam}
            />
          ) : activeSection === "escCal" ? (
            <EscCalSection onStart={handleStartEscCalibration} />
          ) : activeSection === "motorsSetup" ? (
            <MotorsServosSection
              vehicleType={vehicle?.type ?? MavType.GENERIC}
              servoOutputs={servoOutputs}
              onLoad={handleLoadServoOutputs}
              onTestServo={handleSetServoPwm}
              onLoadMotorSetup={handleLoadMotorSetup}
              onSetFrameParam={handleSetParam}
              onTestMotor={handleTestMotor}
              onReboot={handleReboot}
            />
          ) : activeSection === "batteryConfig" ? (
            <BatteryConfigSection
              vehicleType={vehicle?.type ?? MavType.GENERIC}
              battery={battery}
              onLoad={handleLoadBatteryConfig}
              onSetParam={handleSetParam}
            />
          ) : activeSection === "pidTune" ? (
            <PidTuneSection vehicleType={vehicle?.type ?? MavType.GENERIC} onLoad={handleLoadPidParams} onSetParam={handleSetParam} />
          ) : activeSection === "osdSetup" ? (
            <OsdSetupSection vehicleType={vehicle?.type ?? MavType.GENERIC} onLoad={handleLoadOsdSetup} onSetParam={handleSetParam} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
