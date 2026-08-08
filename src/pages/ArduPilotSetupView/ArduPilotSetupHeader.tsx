import { ArrowLeft, FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VERIFIED_FRAME_PRESETS } from "../../mavlink/frameDiagrams/frameDiagrams";
import type { SerialPortInfo } from "../../services/mavlinkTransport/types";

const SELECT_CLASSNAME =
  "flex h-8 min-w-0 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

export interface ArduPilotSetupHeaderProps {
  liveAvailable: boolean;
  mode: "serial" | "udp";
  setMode: (mode: "serial" | "udp") => void;
  ports: SerialPortInfo[];
  selectedPort: string;
  setSelectedPort: (port: string) => void;
  baudRate: number;
  setBaudRate: (rate: number) => void;
  baudRates: readonly number[];
  udpPort: number;
  setUdpPort: (port: number) => void;
  status: "idle" | "connecting" | "connected" | "error";
  detail: string | null;
  errorMessage: string | null;
  scanningPort: string | null;
  scanningBaud: number | null;
  bytesReceived: number;
  bytesSent: number;
  onRefreshPorts: () => void;
  onAutoConnect: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onDevMode: () => void;
  onDevModeCopter: () => void;
  devFramePresetKey: string;
  setDevFramePresetKey: (key: string) => void;
}

export function ArduPilotSetupHeader({
  liveAvailable,
  mode,
  setMode,
  ports,
  selectedPort,
  setSelectedPort,
  baudRate,
  setBaudRate,
  baudRates,
  udpPort,
  setUdpPort,
  status,
  detail,
  errorMessage,
  scanningPort,
  scanningBaud,
  bytesReceived,
  bytesSent,
  onRefreshPorts,
  onAutoConnect,
  onConnect,
  onDisconnect,
  onDevMode,
  onDevModeCopter,
  devFramePresetKey,
  setDevFramePresetKey,
}: ArduPilotSetupHeaderProps) {
  const { t } = useTranslation();
  const isBusy = status === "connecting";
  const isConnected = status === "connected";

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
      <Link
        to="/"
        className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("ardupilotSetup.backToHome")}
      </Link>

      {liveAvailable && (
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            size="sm"
            variant={mode === "serial" ? "secondary" : "outline"}
            disabled={isConnected || isBusy}
            onClick={() => setMode("serial")}
          >
            {t("ardupilotSetup.connect.modeSerial")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "udp" ? "secondary" : "outline"}
            disabled={isConnected || isBusy}
            onClick={() => setMode("udp")}
          >
            {t("ardupilotSetup.connect.modeUdp")}
          </Button>
        </div>
      )}

      {liveAvailable &&
        (mode === "serial" ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <select
              aria-label={t("ardupilotSetup.connect.portLabel")}
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

            <select
              aria-label={t("ardupilotSetup.connect.baudLabel")}
              className={SELECT_CLASSNAME}
              value={baudRate}
              disabled={isConnected || isBusy}
              onChange={(e) => setBaudRate(Number(e.target.value))}
            >
              {baudRates.map((rate) => (
                <option key={rate} value={rate} className="bg-card text-card-foreground">
                  {rate}
                </option>
              ))}
            </select>

            <Button type="button" size="sm" variant="ghost" onClick={onRefreshPorts} disabled={isConnected || isBusy}>
              {t("ardupilotSetup.connect.refreshPorts")}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onAutoConnect}
              disabled={isConnected || isBusy || ports.length === 0}
            >
              {t("ardupilotSetup.connect.autoConnect")}
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <Input
              aria-label={t("ardupilotSetup.connect.udpPortLabel")}
              type="number"
              className="h-8 w-24 text-xs"
              value={udpPort}
              disabled={isConnected || isBusy}
              onChange={(e) => setUdpPort(Number(e.target.value))}
            />
          </div>
        ))}

      {!liveAvailable && (
        <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.connect.webOnlyNotice")}</p>
      )}

      {isConnected ? (
        <Button type="button" size="sm" variant="destructive" className="shrink-0" onClick={onDisconnect}>
          {t("ardupilotSetup.connect.disconnect")}
        </Button>
      ) : (
        <>
          {liveAvailable && (
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={onConnect}
              disabled={isBusy || (mode === "serial" && !selectedPort)}
            >
              {t("ardupilotSetup.connect.connect")}
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1" onClick={onDevMode} disabled={isBusy}>
            <FlaskConical className="h-3.5 w-3.5" />
            {t("ardupilotSetup.connect.devMode")}
          </Button>
          <select
            aria-label={t("ardupilotSetup.connect.devFramePresetLabel")}
            className={SELECT_CLASSNAME}
            value={devFramePresetKey}
            disabled={isBusy}
            onChange={(e) => setDevFramePresetKey(e.target.value)}
          >
            {VERIFIED_FRAME_PRESETS.map((preset) => (
              <option key={preset.key} value={preset.key} className="bg-card text-card-foreground">
                {preset.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 gap-1"
            onClick={onDevModeCopter}
            disabled={isBusy}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            {t("ardupilotSetup.connect.devModeCopter")}
          </Button>
        </>
      )}

      <Alert variant={status === "error" ? "destructive" : "info"} className="min-w-0 flex-1 py-1.5">
        <AlertDescription>
          {status === "idle" && t("ardupilotSetup.connect.statusIdle")}
          {status === "connecting" &&
            (scanningPort
              ? t("ardupilotSetup.connect.autoConnectScanning", { port: scanningPort, baud: scanningBaud })
              : t("ardupilotSetup.connect.statusConnecting"))}
          {status === "connected" && t("ardupilotSetup.connect.statusConnected", { detail })}
          {status === "error" && t("ardupilotSetup.connect.statusError", { message: errorMessage })}
        </AlertDescription>
      </Alert>

      <div className="flex shrink-0 gap-3 font-mono text-xs text-muted-foreground">
        <span>
          {t("ardupilotSetup.connect.bytesReceived")}: {t("ardupilotSetup.connect.bytesUnit", { count: bytesReceived })}
        </span>
        <span>
          {t("ardupilotSetup.connect.bytesSent")}: {t("ardupilotSetup.connect.bytesUnit", { count: bytesSent })}
        </span>
      </div>
    </header>
  );
}
