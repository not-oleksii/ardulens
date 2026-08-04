import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  connectSerial,
  connectUdp,
  disconnect,
  listSerialPorts,
  onData,
  onStatus,
} from "../../services/mavlinkTransport/mavlinkTransport";
import type { SerialPortInfo } from "../../services/mavlinkTransport/types";
import { useMavlinkConnectionStore } from "../../stores/mavlinkConnectionStore/mavlinkConnectionStore";

const BAUD_RATES = [9600, 38400, 57600, 115200, 921600];
const DEFAULT_UDP_PORT = 14550;

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

  const [mode, setMode] = useState<"serial" | "udp">("udp");
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [baudRate, setBaudRate] = useState(BAUD_RATES[2]!);
  const [udpPort, setUdpPort] = useState(DEFAULT_UDP_PORT);

  useEffect(() => {
    let cancelled = false;
    let unlistenData: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

    void onData((bytes) => {
      addBytesReceived(bytes.length);
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unlistenData = unlisten;
    });

    void onStatus((s) => {
      if (s.kind === "connected") setConnected(s.detail);
      else if (s.kind === "disconnected") setDisconnected();
      else setError(s.message);
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unlistenStatus = unlisten;
    });

    return () => {
      cancelled = true;
      unlistenData?.();
      unlistenStatus?.();
    };
  }, [addBytesReceived, setConnected, setDisconnected, setError]);

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
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-7 py-5">
      <Link to="/" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {t("ardupilotSetup.backToHome")}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{t("ardupilotSetup.heading")}</CardTitle>
          <CardDescription>{t("ardupilotSetup.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
              {status === "connecting" && t("ardupilotSetup.connect.statusConnecting")}
              {status === "connected" && t("ardupilotSetup.connect.statusConnected", { detail })}
              {status === "error" && t("ardupilotSetup.connect.statusError", { message: errorMessage })}
            </AlertDescription>
          </Alert>

          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              {t("ardupilotSetup.connect.bytesReceived")}: {t("ardupilotSetup.connect.bytesUnit", { count: bytesReceived })}
            </span>
            <span>
              {t("ardupilotSetup.connect.bytesSent")}: {t("ardupilotSetup.connect.bytesUnit", { count: bytesSent })}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
