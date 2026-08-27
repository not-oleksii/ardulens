import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { VERIFIED_FRAME_PRESETS } from "../../mavlink/frameDiagrams/frameDiagrams";
import { MavType } from "../../mavlink/registry/registry";
import { connectMock, connectSerial, connectUdp, disconnect, isTauriRuntime, listSerialPorts } from "../../services/mavlinkTransport/mavlinkTransport";
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
// ArduPilot sends its own heartbeat at ~1Hz, so 2s is enough margin to see at least one on
// the right port/baud rate combination without making a wrong port take too long to skip.
const AUTO_CONNECT_TIMEOUT_MS = 2000;

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

interface UseArduPilotConnectionOptions {
  // Shared with the onData/onStatus wire-protocol effect (ArduPilotSetupView.tsx), which
  // populates these during a connection and needs them cleared at the start of a new one -
  // owned by the caller rather than this hook so both sides share the same ref instances.
  pendingParamsRef: MutableRefObject<Map<string, ParamEntry>>;
  pendingParamCountRef: MutableRefObject<number | null>;
  ftpSessionRef: MutableRefObject<{ session: number; chunks: Uint8Array[]; bytesReceived: number } | null>;
}

/**
 * Connection setup: mode (serial/UDP), port/baud selection, the auto-connect port*baud scan,
 * and the mock (Dev Mode) connect paths - everything needed before a MAVLink session actually
 * exists. Extracted out of ArduPilotSetupView.tsx's own god-component size; the wire-protocol
 * decoding that happens ONCE connected stays there, since it shares too many refs with the
 * command handlers to split safely in this pass.
 */
export function useArduPilotConnection({ pendingParamsRef, pendingParamCountRef, ftpSessionRef }: UseArduPilotConnectionOptions) {
  const { t } = useTranslation();
  const setConnecting = useMavlinkConnectionStore((s) => s.setConnecting);
  const setError = useMavlinkConnectionStore((s) => s.setError);
  const resetVehicle = useMavlinkVehicleStore((s) => s.reset);
  const resetTelemetry = useMavlinkTelemetryStore((s) => s.reset);
  const resetStatusText = useMavlinkStatusTextStore((s) => s.reset);
  const resetParameters = useMavlinkParameterStore((s) => s.reset);
  const resetCompassCal = useMavlinkCompassCalStore((s) => s.reset);
  const resetAccelCal = useMavlinkAccelCalStore((s) => s.reset);
  const resetRcCal = useMavlinkRcCalStore((s) => s.reset);
  const resetParamDefaults = useMavlinkParamDefaultsStore((s) => s.reset);

  const [mode, setMode] = useState<"serial" | "udp">("serial");
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [baudRate, setBaudRate] = useState(BAUD_RATES[2]!);
  const [udpPort, setUdpPort] = useState(DEFAULT_UDP_PORT);
  const [udpHost, setUdpHost] = useState("");
  const [scanningPort, setScanningPort] = useState<string | null>(null);
  const [scanningBaud, setScanningBaud] = useState<number | null>(null);
  // "Attempt N of total" for the auto-connect port*baud scan below - total isn't just
  // ports.length*bauds.length shown once, since it needs to freeze at the count actually being
  // scanned (a port list refresh mid-scan shouldn't retroactively change what "total" means for
  // an attempt already in flight).
  const [scanIndex, setScanIndex] = useState<number | null>(null);
  const [scanTotal, setScanTotal] = useState<number | null>(null);
  const [devFramePresetKey, setDevFramePresetKey] = useState(VERIFIED_FRAME_PRESETS[1]!.key); // Quad X

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

  // All of the handlers below are useCallback'd (not plain functions) so they stay
  // referentially stable across re-renders unrelated to connection state - ArduPilotSetupHeader
  // and the live-GCS sections receiving them are memoized, and a fresh function reference on
  // every render would defeat that regardless of whether anything they actually depend on
  // changed.
  const refreshPorts = useCallback(async () => {
    try {
      const found = await listSerialPorts();
      setPorts(found);
      setSelectedPort((prev) => (found.some((p) => p.name === prev) ? prev : (found[0]?.name ?? "")));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [setError]);

  const handleConnect = useCallback(async () => {
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
  }, [mode, selectedPort, baudRate, udpPort, udpHost, setConnecting, setError]);

  const handleAutoConnect = useCallback(async () => {
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
    const total = ports.length * bauds.length;
    setScanTotal(total);
    let attempt = 0;
    for (const port of ports) {
      for (const rate of bauds) {
        attempt += 1;
        setScanIndex(attempt);
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
          setScanIndex(null);
          setScanTotal(null);
          return; // stay connected - onStatus already reflected "connected"
        }

        await disconnect().catch(() => {});
      }
    }
    setScanningPort(null);
    setScanningBaud(null);
    setScanIndex(null);
    setScanTotal(null);
    setError(t("ardupilotSetup.connect.autoConnectFailed"));
  }, [
    baudRate,
    ports,
    pendingParamsRef,
    pendingParamCountRef,
    ftpSessionRef,
    t,
    setConnecting,
    setError,
    resetVehicle,
    resetTelemetry,
    resetStatusText,
    resetParameters,
    resetCompassCal,
    resetAccelCal,
    resetRcCal,
    resetParamDefaults,
  ]);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [setError]);

  // Starts an in-process simulated vehicle (see mockVehicleSimulator.ts) instead of a real
  // connection - lets the whole app be exercised without any real hardware, SITL, or even a
  // Tauri backend.
  const handleConnectMockAs = useCallback(
    async (vehicleType: MavType, copterFrame?: { frameClass: number; frameType: number }) => {
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
    },
    [
      pendingParamsRef,
      pendingParamCountRef,
      ftpSessionRef,
      setConnecting,
      setError,
      resetVehicle,
      resetTelemetry,
      resetStatusText,
      resetParameters,
      resetCompassCal,
      resetAccelCal,
      resetRcCal,
      resetParamDefaults,
    ],
  );

  // Defaults to a simulated Plane, matching this project's current real test hardware and the
  // features already built for it (servo mapping/test, compass cal).
  const handleConnectMock = useCallback(async () => {
    await handleConnectMockAs(MavType.FIXED_WING);
  }, [handleConnectMockAs]);

  // Simulated Copter (see MotorsCopterSection.tsx / frameDiagrams.ts) for exercising the
  // Copter half of Motors & Servos without real hardware - starts as whichever of the 6
  // verified frame class/type combos the header's frame-preset selector currently has picked.
  const handleConnectMockCopter = useCallback(async () => {
    const preset = VERIFIED_FRAME_PRESETS.find((p) => p.key === devFramePresetKey) ?? VERIFIED_FRAME_PRESETS[1]!;
    await handleConnectMockAs(MavType.QUADROTOR, { frameClass: preset.frameClass, frameType: preset.frameType });
  }, [devFramePresetKey, handleConnectMockAs]);

  return {
    mode,
    setMode,
    ports,
    selectedPort,
    setSelectedPort,
    baudRate,
    setBaudRate,
    baudRates: BAUD_RATES,
    udpPort,
    setUdpPort,
    udpHost,
    setUdpHost,
    scanningPort,
    scanningBaud,
    scanIndex,
    scanTotal,
    devFramePresetKey,
    setDevFramePresetKey,
    refreshPorts,
    handleConnect,
    handleAutoConnect,
    handleDisconnect,
    handleConnectMock,
    handleConnectMockCopter,
  };
}
