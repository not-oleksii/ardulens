import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArduPilotSetupHeader } from "./ArduPilotSetupHeader";
import { ArduPilotSetupSidebar, type ArduPilotSetupSection } from "./ArduPilotSetupSidebar";
import { ComingSoonSection } from "./ComingSoonSection";
import { CompassCalSection } from "./CompassCalSection";
import { MotorsServosSection } from "./MotorsServosSection";
import { ParametersPanel } from "./ParametersPanel";
import { TelemetrySection } from "./TelemetrySection";
import { encodePacket } from "../../mavlink/codec/codec";
import { VERIFIED_FRAME_PRESETS } from "../../mavlink/frameDiagrams/frameDiagrams";
import { MavlinkFramer } from "../../mavlink/framer/framer";
import { buildParamSetPacket, paramValueToWireBits, paramWireBitsToValue, readParamValueBits } from "../../mavlink/paramValueCodec/paramValueCodec";
import {
  Attitude,
  CommandAck,
  DoAcceptMagCalCommand,
  DoCancelMagCalCommand,
  DoMotorTestCommand,
  DoSetServoCommand,
  DoStartMagCalCommand,
  GlobalPositionInt,
  GpsRawInt,
  Heartbeat,
  MagCalProgress,
  MagCalReport,
  MavAutopilot,
  MavCmd,
  MavDataStream,
  MavModeFlag,
  MavParamType,
  MavState,
  MavType,
  MotorTestThrottleType,
  ParamRequestList,
  ParamRequestRead,
  ParamSet,
  ParamValue,
  RequestDataStream,
  ServoOutputRaw,
  SysStatus,
  VfrHud,
} from "../../mavlink/registry/registry";
import {
  connectMock,
  connectSerial,
  connectUdp,
  disconnect,
  listSerialPorts,
  onData,
  onStatus,
  sendBytes,
} from "../../services/mavlinkTransport/mavlinkTransport";
import type { SerialPortInfo } from "../../services/mavlinkTransport/types";
import { useMavlinkCompassCalStore } from "../../stores/mavlinkCompassCalStore/mavlinkCompassCalStore";
import { useMavlinkConnectionStore } from "../../stores/mavlinkConnectionStore/mavlinkConnectionStore";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import type { ParamEntry } from "../../stores/mavlinkParameterStore/types";
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
  const resetVehicle = useMavlinkVehicleStore((s) => s.reset);
  const attitude = useMavlinkTelemetryStore((s) => s.attitude);
  const vfrHud = useMavlinkTelemetryStore((s) => s.vfrHud);
  const battery = useMavlinkTelemetryStore((s) => s.battery);
  const gps = useMavlinkTelemetryStore((s) => s.gps);
  const position = useMavlinkTelemetryStore((s) => s.position);
  const setAttitude = useMavlinkTelemetryStore((s) => s.setAttitude);
  const setVfrHud = useMavlinkTelemetryStore((s) => s.setVfrHud);
  const setBattery = useMavlinkTelemetryStore((s) => s.setBattery);
  const setGps = useMavlinkTelemetryStore((s) => s.setGps);
  const setPosition = useMavlinkTelemetryStore((s) => s.setPosition);
  const servoOutputs = useMavlinkTelemetryStore((s) => s.servoOutputs);
  const mergeServoOutputs = useMavlinkTelemetryStore((s) => s.mergeServoOutputs);
  const resetTelemetry = useMavlinkTelemetryStore((s) => s.reset);
  const setParams = useMavlinkParameterStore((s) => s.setParams);
  const resetParameters = useMavlinkParameterStore((s) => s.reset);
  const compassCalProgress = useMavlinkCompassCalStore((s) => s.progress);
  const compassCalReports = useMavlinkCompassCalStore((s) => s.reports);
  const compassCalLastCommandAck = useMavlinkCompassCalStore((s) => s.lastCommandAck);
  const setCompassCalProgress = useMavlinkCompassCalStore((s) => s.setProgress);
  const setCompassCalReport = useMavlinkCompassCalStore((s) => s.setReport);
  const setCompassCalLastCommandAck = useMavlinkCompassCalStore((s) => s.setLastCommandAck);
  const resetCompassCal = useMavlinkCompassCalStore((s) => s.reset);

  const [mode, setMode] = useState<"serial" | "udp">("udp");
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [baudRate, setBaudRate] = useState(BAUD_RATES[2]!);
  const [udpPort, setUdpPort] = useState(DEFAULT_UDP_PORT);
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

  useEffect(() => {
    let cancelled = false;
    let unlistenData: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

    void onData((bytes) => {
      addBytesReceived(bytes.length);
      for (const packet of framerRef.current.push(bytes)) {
        const now = Date.now();
        switch (packet.msgId) {
          case Heartbeat.MSG_ID: {
            const hb = packet.message as Heartbeat;
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
            // Only the mag-cal commands are surfaced here - a NACK on any of them (e.g.
            // DENIED because a compass is unhealthy) would otherwise look like nothing
            // happened at all, since MAG_CAL_PROGRESS never arrives in that case. `command`
            // is a plain uint16_t on the wire (not typed as MavCmd), hence the cast.
            const command = msg.command as MavCmd;
            if (command === MavCmd.DO_START_MAG_CAL || command === MavCmd.DO_ACCEPT_MAG_CAL || command === MavCmd.DO_CANCEL_MAG_CAL) {
              setCompassCalLastCommandAck({ command, result: msg.result });
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
        resetParameters();
        resetCompassCal();
        pendingParamsRef.current.clear();
        pendingParamCountRef.current = null;
        streamsRequestedRef.current = false;
      } else {
        setError(s.message);
        resetVehicle();
        resetTelemetry();
        resetParameters();
        resetCompassCal();
        pendingParamsRef.current.clear();
        pendingParamCountRef.current = null;
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
    setConnected,
    setDisconnected,
    setError,
    setVehicle,
    resetVehicle,
    setAttitude,
    setVfrHud,
    setBattery,
    setGps,
    setPosition,
    mergeServoOutputs,
    resetTelemetry,
    resetParameters,
    resetCompassCal,
    setCompassCalProgress,
    setCompassCalReport,
    setCompassCalLastCommandAck,
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
        await connectUdp(udpPort);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleAutoConnect() {
    setConnecting();
    resetVehicle();
    resetTelemetry();
    resetParameters();
    resetCompassCal();
    pendingParamsRef.current.clear();
    pendingParamCountRef.current = null;
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
    resetParameters();
    resetCompassCal();
    pendingParamsRef.current.clear();
    pendingParamCountRef.current = null;
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

  // Requests exactly the two params the Copter half of Motors & Servos needs to know the
  // vehicle's real motor layout (see frameDiagrams.ts) - same self-contained by-name pattern
  // as handleLoadServoOutputs above, rather than depending on the full parameter list.
  function handleLoadFrameInfo() {
    if (!vehicle) return;
    for (const name of ["FRAME_CLASS", "FRAME_TYPE"]) {
      const req = new ParamRequestRead();
      req.targetSystem = vehicle.sysid;
      req.targetComponent = vehicle.compid;
      req.paramId = name;
      req.paramIndex = -1;
      sendGcsPacket(encodePacket(req, { seq: nextSeq(), sysid: GCS_SYSID, compid: GCS_COMPID }));
    }
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

  const isConnected = status === "connected";

  return (
    <div className="ardupilot-setup-theme flex h-svh flex-col overflow-hidden">
      <ArduPilotSetupHeader
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
        onDevMode={() => void handleConnectMock()}
        onDevModeCopter={() => void handleConnectMockCopter()}
        devFramePresetKey={devFramePresetKey}
        setDevFramePresetKey={setDevFramePresetKey}
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
            />
          ) : activeSection === "parameters" ? (
            <ParametersPanel
              vehicleType={vehicle?.type ?? MavType.GENERIC}
              onLoadParameters={handleLoadParameters}
              onRequestMissing={handleRequestMissingParameters}
              onSetParam={handleSetParam}
            />
          ) : activeSection === "compassCal" ? (
            <CompassCalSection
              progress={compassCalProgress}
              reports={compassCalReports}
              lastCommandAck={compassCalLastCommandAck}
              onStart={handleStartCompassCal}
              onAccept={handleAcceptCompassCal}
              onCancel={handleCancelCompassCal}
            />
          ) : activeSection === "motorsSetup" ? (
            <MotorsServosSection
              vehicleType={vehicle?.type ?? MavType.GENERIC}
              servoOutputs={servoOutputs}
              onLoad={handleLoadServoOutputs}
              onTestServo={handleSetServoPwm}
              onLoadFrameInfo={handleLoadFrameInfo}
              onSetFrameParam={handleSetParam}
              onTestMotor={handleTestMotor}
            />
          ) : (
            <ComingSoonSection
              heading={t("ardupilotSetup.sidebar.pidTune")}
              description={t("ardupilotSetup.comingSoon.pidTune")}
            />
          )}
        </main>
      </div>
    </div>
  );
}
