import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFileStore } from "../../stores/fileStore/fileStore";
import type { DataflashDownloadPhase, DataflashLogEntry } from "../../stores/mavlinkDataflashLogStore/types";
import { useUiStore } from "../../stores/uiStore/uiStore";

interface DataflashLogsSectionProps {
  entries: DataflashLogEntry[];
  numLogsExpected: number | null;
  listRequested: boolean;
  downloadPhase: DataflashDownloadPhase;
  downloadId: number | null;
  downloadTotalBytes: number | null;
  downloadBytesReceived: number;
  downloadedFile: Uint8Array | null;
  onRequestList: () => void;
  onDownload: (id: number, sizeBytes: number) => void;
}

function fmtLogTime(t: (key: string) => string, timeUtc: number): string {
  if (timeUtc <= 0) return t("ardupilotSetup.dataflashLogs.unknownTime");
  return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(timeUtc * 1000));
}

export function DataflashLogsSection({
  entries,
  numLogsExpected,
  listRequested,
  downloadPhase,
  downloadId,
  downloadTotalBytes,
  downloadBytesReceived,
  downloadedFile,
  onRequestList,
  onDownload,
}: DataflashLogsSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setFile = useFileStore((s) => s.setFile);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  // Only one download runs at a time (matches the Options-dialog-style "one thing open at once"
  // convention elsewhere in this app) - other rows just get a disabled Download button while one
  // is in progress.
  const downloadInProgress = downloadPhase === "downloading";

  function handleSaveFile(id: number, file: Uint8Array) {
    const blob = new Blob([file.buffer as ArrayBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dataflash-log-${id}.bin`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Hands the downloaded bytes to the SAME fileStore the home screen's drag-and-drop uses, then
  // deep-links into the Map tab - reuses this app's whole existing post-flight analysis suite
  // (flight-map, graphs, raw log browser) instead of building a separate viewer for a live-
  // downloaded log, the same cross-navigation shape PidTuneSection's "View in Graphs" uses.
  function handleViewOnMap(id: number, file: Uint8Array) {
    setFile({ name: `dataflash-log-${id}.bin`, buf: file.buffer as ArrayBuffer });
    setActiveTab("map");
    void navigate("/");
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.dataflashLogs.heading")}</h3>
        <Button type="button" size="sm" variant="outline" onClick={onRequestList}>
          {t("ardupilotSetup.dataflashLogs.refreshList")}
        </Button>
      </div>

      {!listRequested && entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("ardupilotSetup.dataflashLogs.notLoaded")}</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("ardupilotSetup.dataflashLogs.waitingForList")}</p>
      ) : (
        <>
          {numLogsExpected !== null && entries.length < numLogsExpected && (
            <p className="text-xs text-muted-foreground">
              {t("ardupilotSetup.dataflashLogs.listProgress", { received: entries.length, total: numLogsExpected })}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ardupilotSetup.dataflashLogs.id")}</TableHead>
                  <TableHead>{t("ardupilotSetup.dataflashLogs.time")}</TableHead>
                  <TableHead>{t("ardupilotSetup.dataflashLogs.size")}</TableHead>
                  <TableHead>{t("ardupilotSetup.dataflashLogs.action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const isThisDownload = downloadId === entry.id;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono">{entry.id}</TableCell>
                      <TableCell>{fmtLogTime(t, entry.timeUtc)}</TableCell>
                      <TableCell className="font-mono">{entry.sizeBytes.toLocaleString()}</TableCell>
                      <TableCell>
                        {isThisDownload && downloadPhase === "downloading" ? (
                          <div className="flex w-40 flex-col gap-1">
                            <p className="text-xs text-muted-foreground">
                              {t("ardupilotSetup.dataflashLogs.downloading", {
                                received: downloadBytesReceived.toLocaleString(),
                                total: (downloadTotalBytes ?? entry.sizeBytes).toLocaleString(),
                              })}
                            </p>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full bg-primary transition-[width]"
                                style={{
                                  width: `${Math.min(100, Math.round((downloadBytesReceived / (downloadTotalBytes ?? entry.sizeBytes)) * 100))}%`,
                                }}
                              />
                            </div>
                          </div>
                        ) : isThisDownload && downloadPhase === "done" && downloadedFile ? (
                          <div className="flex items-center gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => handleSaveFile(entry.id, downloadedFile)}>
                              {t("ardupilotSetup.dataflashLogs.saveFile")}
                            </Button>
                            <Button type="button" size="sm" onClick={() => handleViewOnMap(entry.id, downloadedFile)}>
                              {t("ardupilotSetup.dataflashLogs.viewOnMap")}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={downloadInProgress}
                            onClick={() => onDownload(entry.id, entry.sizeBytes)}
                          >
                            {t("ardupilotSetup.dataflashLogs.download")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
