import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { isTauriRuntime } from "../../services/mavlinkTransport/mavlinkTransport";
import { startTelemetryRecording, type TelemetryRecorderHandle } from "../../services/telemetryRecorder/telemetryRecorder";
import { useFileStore } from "../../stores/fileStore/fileStore";
import { useUiStore } from "../../stores/uiStore/uiStore";

/**
 * Live-session .tlog recording: start/stop, the once-a-second stats poll while recording, and
 * Save/View for the finished bytes. `recordingHandleRef` and the three setters are returned
 * (not just derived values) so ArduPilotSetupView's own onData/onStatus effect can finalize a
 * recording still in progress when the link drops, without this hook needing to know anything
 * about the connection itself.
 */
export function useSessionRecording() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setFile = useFileStore((s) => s.setFile);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  // Non-null while a live-session recording is in progress (its value is the recording's own
  // start time, shown as an elapsed-time readout in the header) - see telemetryRecorder.ts.
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingStats, setRecordingStats] = useState<{ packetCount: number; byteCount: number } | null>(null);
  // The finished .tlog bytes once a recording is stopped - stays populated (offering Save/
  // View) until a new recording starts, matching DataflashLogsSection's own "downloadedFile
  // stays available until the next download" convention.
  const [recordedTlogBytes, setRecordedTlogBytes] = useState<Uint8Array | null>(null);
  const recordingHandleRef = useRef<TelemetryRecorderHandle | null>(null);

  // Polls the recorder's own packet/byte counters into React state once a second while
  // recording - getStats() is a plain function call (not itself reactive), same "poll a ref-
  // backed counter on an interval" shape as the Inspector's own tickRates().
  useEffect(() => {
    if (recordingStartedAt === null) return;
    const id = window.setInterval(() => {
      const stats = recordingHandleRef.current?.getStats();
      if (stats) setRecordingStats(stats);
    }, 1000);
    return () => window.clearInterval(id);
  }, [recordingStartedAt]);

  function handleStartRecording() {
    if (recordingHandleRef.current) return; // already recording
    recordingHandleRef.current = startTelemetryRecording();
    setRecordingStartedAt(Date.now());
    setRecordingStats({ packetCount: 0, byteCount: 0 });
    setRecordedTlogBytes(null);
  }

  function handleStopRecording() {
    const handle = recordingHandleRef.current;
    if (!handle) return;
    recordingHandleRef.current = null;
    setRecordedTlogBytes(handle.stop());
    setRecordingStartedAt(null);
    setRecordingStats(null);
  }

  // Under Tauri, a real native "Save As" dialog + direct filesystem write - the Blob+`<a
  // download>` trick DataflashLogsSection uses for its own Save button is a real browser
  // mechanism, but WebView2 doesn't reliably surface it as a visible save prompt the way a
  // plain Chrome tab does (confirmed live: the click fires but no dialog ever appears, no
  // error either) - a real environment gap, not a coding mistake in the original approach.
  // The plain-browser build (no Tauri backend) still needs the Blob fallback, since the
  // dialog/fs plugins only work under Tauri.
  async function handleSaveRecording() {
    if (!recordedTlogBytes) return;
    const filename = `ardulens-session-${new Date().toISOString().replace(/[:.]/g, "-")}.tlog`;

    if (isTauriRuntime()) {
      const path = await save({
        title: t("ardupilotSetup.connect.saveRecording"),
        defaultPath: filename,
        filters: [{ name: "MAVLink Telemetry Log", extensions: ["tlog"] }],
      });
      if (!path) return; // user cancelled
      await invoke("grant_file_access", { path });
      await writeFile(path, recordedTlogBytes);
      return;
    }

    const blob = new Blob([recordedTlogBytes.buffer as ArrayBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Hands the recorded bytes to the SAME fileStore the home screen's drag-and-drop uses, then
  // deep-links into the Logs tab - the same cross-navigation shape DataflashLogsSection's own
  // "View on map" and PidTuneSection's "View in Graphs" already use. Logs (not Map, unlike
  // DataflashLogsSection) since a recorded session's derived Flight/Sample data is the same
  // shape a .bin's is, but doesn't yet have Map-tab support (CesiumMapView's own worker call
  // is dataflash-.bin-specific) - a real, honest v1 scope cut, not an oversight.
  function handleViewRecording() {
    if (!recordedTlogBytes) return;
    setFile({ name: `ardulens-session-${Date.now()}.tlog`, buf: recordedTlogBytes.buffer as ArrayBuffer });
    setActiveTab("logs");
    void navigate("/");
  }

  return {
    recordingStartedAt,
    setRecordingStartedAt,
    recordingStats,
    setRecordingStats,
    recordedTlogBytes,
    setRecordedTlogBytes,
    recordingHandleRef,
    handleStartRecording,
    handleStopRecording,
    handleSaveRecording,
    handleViewRecording,
  };
}
