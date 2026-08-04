import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PrimaryFlightDisplay } from "../../components/PrimaryFlightDisplay/PrimaryFlightDisplay";
import { PLANE_MODE_NAMES } from "../../constants";
import { encodePacket } from "../../mavlink/codec/codec";
import { MavlinkFramer } from "../../mavlink/framer/framer";
import { gpsFixTypeLabel, mavAutopilotLabel, mavStateLabel, mavTypeLabel } from "../../mavlink/labels/labels";
import {
  Attitude,
  GlobalPositionInt,
  GpsRawInt,
  Heartbeat,
  MavAutopilot,
  MavDataStream,
  MavModeFlag,
  MavState,
  MavType,
  RequestDataStream,
  SysStatus,
  VfrHud,
} from "../../mavlink/registry/registry";
import {
  connectSerial,
  connectUdp,
  disconnect,
  listSerialPorts,
  onData,
  onStatus,
  sendBytes,
} from "../../services/mavlinkTransport/mavlinkTransport";
import type { SerialPortInfo } from "../../services/mavlinkTransport/types";
import { useMavlinkConnectionStore } from "../../stores/mavlinkConnectionStore/mavlinkConnectionStore";
import { useMavlinkTelemetryStore } from "../../stores/mavlinkTelemetryStore/mavlinkTelemetryStore";
import { useMavlinkVehicleStore } from "../../stores/mavlinkVehicleStore/mavlinkVehicleStore";

const BAUD_RATES = [9600, 38400, 57600, 115200, 921600];
const DEFAULT_UDP_PORT = 14550;
const HEARTBEAT_INTERVAL_MS = 1000;
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

const SELECT_CLASSNAME =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

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
  const resetTelemetry = useMavlinkTelemetryStore((s) => s.reset);

  const [mode, setMode] = useState<"serial" | "udp">("udp");
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [baudRate, setBaudRate] = useState(BAUD_RATES[2]!);
  const [udpPort, setUdpPort] = useState(DEFAULT_UDP_PORT);
  const [scanningPort, setScanningPort] = useState<string | null>(null);

  const framerRef = useRef(new MavlinkFramer());
  const outgoingSeqRef = useRef(0);
  const streamsRequestedRef = useRef(false);

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
        streamsRequestedRef.current = false;
      } else {
        setError(s.message);
        resetVehicle();
        resetTelemetry();
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
    resetTelemetry,
  ]);

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
    for (const port of ports) {
      setScanningPort(port.name);
      try {
        await connectSerial(port.name, baudRate);
      } catch {
        continue; // couldn't even open this one - try the next
      }

      const found = await waitForHeartbeat(AUTO_CONNECT_TIMEOUT_MS);
      if (found) {
        setSelectedPort(port.name);
        setScanningPort(null);
        return; // stay connected - onStatus already reflected "connected"
      }

      await disconnect().catch(() => {});
    }
    setScanningPort(null);
    setError(t("ardupilotSetup.connect.autoConnectFailed"));
  }

  async function handleDisconnect() {
    try {
      await disconnect();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const isBusy = status === "connecting";
  const isConnected = status === "connected";

  return (
    <div className="ardupilot-setup-theme flex flex-1 flex-col gap-4 px-6 py-4">
      <Link to="/" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {t("ardupilotSetup.backToHome")}
      </Link>

      <Card className="flex flex-1 flex-col">
        <CardHeader>
          <CardTitle className="font-bold">{t("ardupilotSetup.heading")}</CardTitle>
          <CardDescription>{t("ardupilotSetup.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "serial" ? "secondary" : "outline"}
              size="sm"
              disabled={isConnected || isBusy}
              onClick={() => setMode("serial")}
            >
              {t("ardupilotSetup.connect.modeSerial")}
            </Button>
            <Button
              type="button"
              variant={mode === "udp" ? "secondary" : "outline"}
              size="sm"
              disabled={isConnected || isBusy}
              onClick={() => setMode("udp")}
            >
              {t("ardupilotSetup.connect.modeUdp")}
            </Button>
          </div>

          {mode === "serial" ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor="serial-port" className="text-xs text-muted-foreground">
                  {t("ardupilotSetup.connect.portLabel")}
                </label>
                <select
                  id="serial-port"
                  className={SELECT_CLASSNAME}
                  value={selectedPort}
                  disabled={isConnected || isBusy}
                  onChange={(e) => setSelectedPort(e.target.value)}
                >
                  {ports.length === 0 && (
                    <option value="" className="bg-card text-card-foreground">
                      {t("ardupilotSetup.connect.portPlaceholder")}
                    </option>
                  )}
                  {ports.map((p) => (
                    <option key={p.name} value={p.name} className="bg-card text-card-foreground">
                      {p.description ? `${p.name} - ${p.description}` : p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="baud-rate" className="text-xs text-muted-foreground">
                  {t("ardupilotSetup.connect.baudLabel")}
                </label>
                <select
                  id="baud-rate"
                  className={SELECT_CLASSNAME}
                  value={baudRate}
                  disabled={isConnected || isBusy}
                  onChange={(e) => setBaudRate(Number(e.target.value))}
                >
                  {BAUD_RATES.map((rate) => (
                    <option key={rate} value={rate} className="bg-card text-card-foreground">
                      {rate}
                    </option>
                  ))}
                </select>
              </div>

              <Button type="button" variant="ghost" onClick={() => void refreshPorts()} disabled={isConnected || isBusy}>
                {t("ardupilotSetup.connect.refreshPorts")}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => void handleAutoConnect()}
                disabled={isConnected || isBusy || ports.length === 0}
              >
                {t("ardupilotSetup.connect.autoConnect")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label htmlFor="udp-port" className="text-xs text-muted-foreground">
                {t("ardupilotSetup.connect.udpPortLabel")}
              </label>
              <Input
                id="udp-port"
                type="number"
                className="max-w-40"
                value={udpPort}
                disabled={isConnected || isBusy}
                onChange={(e) => setUdpPort(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">{t("ardupilotSetup.connect.udpPortHint")}</p>
            </div>
          )}

          <div>
            {isConnected ? (
              <Button type="button" variant="destructive" onClick={() => void handleDisconnect()}>
                {t("ardupilotSetup.connect.disconnect")}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void handleConnect()}
                disabled={isBusy || (mode === "serial" && !selectedPort)}
              >
                {t("ardupilotSetup.connect.connect")}
              </Button>
            )}
          </div>

          <Alert variant={status === "error" ? "destructive" : "info"}>
            <AlertDescription>
              {status === "idle" && t("ardupilotSetup.connect.statusIdle")}
              {status === "connecting" &&
                (scanningPort
                  ? t("ardupilotSetup.connect.autoConnectScanning", { port: scanningPort })
                  : t("ardupilotSetup.connect.statusConnecting"))}
              {status === "connected" && t("ardupilotSetup.connect.statusConnected", { detail })}
              {status === "error" && t("ardupilotSetup.connect.statusError", { message: errorMessage })}
            </AlertDescription>
          </Alert>

          <div className="flex gap-4 font-mono text-xs text-muted-foreground">
            <span>
              {t("ardupilotSetup.connect.bytesReceived")}: {t("ardupilotSetup.connect.bytesUnit", { count: bytesReceived })}
            </span>
            <span>
              {t("ardupilotSetup.connect.bytesSent")}: {t("ardupilotSetup.connect.bytesUnit", { count: bytesSent })}
            </span>
          </div>

          {isConnected && (
            <div className="grid flex-1 grid-cols-1 gap-6 border-t border-border pt-4 lg:grid-cols-[minmax(320px,480px)_1fr]">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.vehicle.heading")}</h3>
                  {vehicle ? (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                      <dt className="text-muted-foreground">{t("ardupilotSetup.vehicle.type")}</dt>
                      <dd>{mavTypeLabel(t, vehicle.type)}</dd>
                      <dt className="text-muted-foreground">{t("ardupilotSetup.vehicle.autopilot")}</dt>
                      <dd>{mavAutopilotLabel(t, vehicle.autopilot)}</dd>
                      <dt className="text-muted-foreground">{t("ardupilotSetup.vehicle.status")}</dt>
                      <dd>{mavStateLabel(t, vehicle.systemStatus)}</dd>
                    </dl>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("ardupilotSetup.vehicle.waitingForHeartbeat")}</p>
                  )}
                </div>

                {vehicle && (
                  <div className="flex flex-col gap-3 border-t border-border pt-4">
                    <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.telemetry.heading")}</h3>
                    <PrimaryFlightDisplay
                      rollRad={attitude?.rollRad ?? null}
                      pitchRad={attitude?.pitchRad ?? null}
                      headingDeg={vfrHud?.headingDeg ?? null}
                      airspeed={vfrHud?.airspeed ?? null}
                      altitudeM={vfrHud?.altitudeM ?? null}
                      armed={vehicle.armed}
                      modeLabel={
                        vehicle.type === MavType.FIXED_WING
                          ? (PLANE_MODE_NAMES[vehicle.customMode] ?? String(vehicle.customMode))
                          : String(vehicle.customMode)
                      }
                    />
                    {battery || gps || position ? (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                        <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.batteryVoltage")}</dt>
                        <dd className="font-mono">{battery ? `${battery.voltageV.toFixed(2)} V` : "-"}</dd>
                        <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.batteryCurrent")}</dt>
                        <dd className="font-mono">
                          {battery && battery.currentA !== null ? `${battery.currentA.toFixed(1)} A` : "-"}
                        </dd>
                        <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.batteryRemaining")}</dt>
                        <dd className="font-mono">
                          {battery && battery.remainingPercent !== null ? `${battery.remainingPercent}%` : "-"}
                        </dd>
                        <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.gpsFixLabel")}</dt>
                        <dd>{gps ? gpsFixTypeLabel(t, gps.fixType) : "-"}</dd>
                        <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.satellites")}</dt>
                        <dd className="font-mono">{gps ? gps.satellitesVisible : "-"}</dd>
                        <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.position")}</dt>
                        <dd className="font-mono">
                          {position ? `${position.lat.toFixed(6)}, ${position.lon.toFixed(6)}` : "-"}
                        </dd>
                      </dl>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("ardupilotSetup.telemetry.waitingForTelemetry")}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex min-h-80 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border">
                <p className="text-sm font-medium">{t("ardupilotSetup.map.heading")}</p>
                <p className="text-xs text-muted-foreground">{t("ardupilotSetup.map.comingSoon")}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
