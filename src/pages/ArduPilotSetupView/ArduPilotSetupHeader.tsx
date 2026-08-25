import { ArrowLeft, Circle, Download, FlaskConical, ListVideo, RotateCw, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { VERIFIED_FRAME_PRESETS } from "../../mavlink/frameDiagrams/frameDiagrams";
import { mavResultLabel } from "../../mavlink/labels/labels";
import { MavResult } from "../../mavlink/registry/registry";
import type { SerialPortInfo } from "../../services/mavlinkTransport/types";
import { connectionErrorRemediation } from "../../utils/connectionErrorRemediation/connectionErrorRemediation";

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
  udpHost: string;
  setUdpHost: (host: string) => void;
  status: "idle" | "connecting" | "connected" | "error";
  detail: string | null;
  errorMessage: string | null;
  scanningPort: string | null;
  scanningBaud: number | null;
  scanIndex: number | null;
  scanTotal: number | null;
  bytesReceived: number;
  bytesSent: number;
  onRefreshPorts: () => void;
  onAutoConnect: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onReboot: () => void;
  rebootLastCommandAck: MavResult | null;
  onDevMode: () => void;
  onDevModeCopter: () => void;
  devFramePresetKey: string;
  setDevFramePresetKey: (key: string) => void;
  isRecording: boolean;
  recordingStartedAt: number | null;
  recordingStats: { packetCount: number; byteCount: number } | null;
  hasRecordingToSave: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSaveRecording: () => void;
  onViewRecording: () => void;
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
  udpHost,
  setUdpHost,
  status,
  detail,
  errorMessage,
  scanningPort,
  scanningBaud,
  scanIndex,
  scanTotal,
  bytesReceived,
  bytesSent,
  onRefreshPorts,
  onAutoConnect,
  onConnect,
  onDisconnect,
  onReboot,
  rebootLastCommandAck,
  onDevMode,
  onDevModeCopter,
  devFramePresetKey,
  setDevFramePresetKey,
  isRecording,
  recordingStartedAt,
  recordingStats,
  hasRecordingToSave,
  onStartRecording,
  onStopRecording,
  onSaveRecording,
  onViewRecording,
}: ArduPilotSetupHeaderProps) {
  const { t } = useTranslation();
  const isBusy = status === "connecting";
  const isConnected = status === "connected";

  // A purely local "now" tick - `recordingStartedAt` (the source of truth) lives in the
  // parent, this just re-reads the clock once a second so the elapsed-time text below keeps
  // advancing, without making the parent manage a timer for a concern this component can
  // fully own itself. Date.now() is read here (inside the effect, a real side-effect context)
  // rather than directly in the render body, which this codebase's react-hooks/purity rule
  // (enforced via the React Compiler) flags as an impure render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isRecording) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isRecording]);
  const recordingElapsedSec = recordingStartedAt !== null ? Math.floor((now - recordingStartedAt) / 1000) : 0;

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
      <Link
        to="/"
        className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("ardupilotSetup.backToHome")}
      </Link>

      {/* Once connected, none of this (mode toggle, port/baud/UDP inputs, the web-only notice)
          is still actionable - it used to just sit there disabled, cluttering the bar with
          controls for a step that's already done. */}
      {!isConnected && (
        <>
          {liveAvailable && (
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                size="sm"
                variant={mode === "serial" ? "secondary" : "outline"}
                disabled={isBusy}
                onClick={() => setMode("serial")}
              >
                {t("ardupilotSetup.connect.modeSerial")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "udp" ? "secondary" : "outline"}
                disabled={isBusy}
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
                  disabled={isBusy}
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
                  disabled={isBusy}
                  onChange={(e) => setBaudRate(Number(e.target.value))}
                >
                  {baudRates.map((rate) => (
                    <option key={rate} value={rate} className="bg-card text-card-foreground">
                      {rate}
                    </option>
                  ))}
                </select>

                <Button type="button" size="sm" variant="ghost" onClick={onRefreshPorts} disabled={isBusy}>
                  {t("ardupilotSetup.connect.refreshPorts")}
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onAutoConnect}
                  disabled={isBusy || ports.length === 0}
                >
                  {t("ardupilotSetup.connect.autoConnect")}
                </Button>
              </div>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <Input
                  aria-label={t("ardupilotSetup.connect.udpHostLabel")}
                  type="text"
                  placeholder={t("ardupilotSetup.connect.udpHostPlaceholder")}
                  title={t("ardupilotSetup.connect.udpHostHint")}
                  className="h-8 w-32 text-xs"
                  value={udpHost}
                  disabled={isBusy}
                  onChange={(e) => setUdpHost(e.target.value)}
                />
                <Input
                  aria-label={t("ardupilotSetup.connect.udpPortLabel")}
                  type="number"
                  className="h-8 w-24 text-xs"
                  value={udpPort}
                  disabled={isBusy}
                  onChange={(e) => setUdpPort(Number(e.target.value))}
                />
              </div>
            ))}

          {!liveAvailable && (
            <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.connect.webOnlyNotice")}</p>
          )}
        </>
      )}

      {isConnected ? (
        <>
          <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1" onClick={onReboot}>
            <RotateCw className="h-3.5 w-3.5" />
            {t("ardupilotSetup.connect.reboot")}
          </Button>
          {rebootLastCommandAck !== null && (
            // Without this, a rejected reboot (e.g. DENIED while armed) looked exactly like the
            // button doing nothing at all - nothing else in the UI changes on a NACK.
            <span
              className={cn(
                "shrink-0 text-xs",
                rebootLastCommandAck === MavResult.ACCEPTED ? "text-muted-foreground" : "text-destructive",
              )}
            >
              {rebootLastCommandAck === MavResult.ACCEPTED
                ? t("ardupilotSetup.connect.rebootAccepted")
                : t("ardupilotSetup.connect.rebootRejected", { result: mavResultLabel(t, rebootLastCommandAck) })}
            </span>
          )}

          {isRecording ? (
            <>
              <Button type="button" size="sm" variant="destructive" className="shrink-0 gap-1" onClick={onStopRecording}>
                <Square className="h-3.5 w-3.5 fill-current" />
                {t("ardupilotSetup.connect.stopRecording")}
              </Button>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {t("ardupilotSetup.connect.recordingElapsed", {
                  time: `${String(Math.floor(recordingElapsedSec / 60)).padStart(2, "0")}:${String(recordingElapsedSec % 60).padStart(2, "0")}`,
                  packets: (recordingStats?.packetCount ?? 0).toLocaleString(),
                })}
              </span>
            </>
          ) : hasRecordingToSave ? (
            <>
              <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1" onClick={onSaveRecording}>
                <Download className="h-3.5 w-3.5" />
                {t("ardupilotSetup.connect.saveRecording")}
              </Button>
              <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1" onClick={onViewRecording}>
                <ListVideo className="h-3.5 w-3.5" />
                {t("ardupilotSetup.connect.viewRecording")}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="shrink-0 gap-1" onClick={onStartRecording}>
                <Circle className="h-3.5 w-3.5" />
                {t("ardupilotSetup.connect.startRecording")}
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1" onClick={onStartRecording}>
              <Circle className="h-3.5 w-3.5" />
              {t("ardupilotSetup.connect.startRecording")}
            </Button>
          )}

          <Button type="button" size="sm" variant="destructive" className="shrink-0" onClick={onDisconnect}>
            {t("ardupilotSetup.connect.disconnect")}
          </Button>
        </>
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
              ? t("ardupilotSetup.connect.autoConnectScanning", {
                  port: scanningPort,
                  baud: scanningBaud,
                  index: scanIndex,
                  total: scanTotal,
                })
              : t("ardupilotSetup.connect.statusConnecting"))}
          {status === "connected" && t("ardupilotSetup.connect.statusConnected", { detail })}
          {status === "error" && (
            <>
              {t("ardupilotSetup.connect.statusError", { message: errorMessage })}
              {errorMessage &&
                (() => {
                  const remediation = connectionErrorRemediation(t, errorMessage);
                  return remediation ? <span className="block font-normal">{remediation}</span> : null;
                })()}
            </>
          )}
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
