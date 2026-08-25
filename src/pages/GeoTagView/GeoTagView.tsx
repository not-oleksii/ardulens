import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { exists, mkdir, readDir, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CamGeoTag } from "../../analysis/geotag/geotag";
import { geotagJpegBytes } from "../../analysis/geotag/geotagExif";
import { useDerivedFromFile } from "../../hooks/useDerivedFromFile/useDerivedFromFile";
import { isTauriRuntime } from "../../services/mavlinkTransport/mavlinkTransport";
import { getCoreWorker } from "../../services/coreWorkerClient/coreWorkerClient";
import { useFileStore } from "../../stores/fileStore/fileStore";

const IMAGE_NAME_PATTERN = /\.(jpe?g)$/i;
const GEOTAGGED_SUBFOLDER = "_geotagged";

interface WriteResult {
  succeeded: number;
  failed: string[];
}

/** Mission Planner's GeoTag tool, "CAM Message mode" - ArduPilot's own dataflash CAM message
 *  (one record per camera-trigger event, already embedded in a .bin log) is matched 1:1, in
 *  filename order, against a folder of JPEGs, then each photo's real GPS position/altitude at
 *  the moment it was taken is written into a geotagged copy's EXIF - ready for photogrammetry
 *  tools (Pix4D, DroneDeploy, WebODM, etc.). No clock-sync guessing between camera and
 *  autopilot needed, unlike Mission Planner's alternate "Time Offset" mode (EXIF-timestamp
 *  correlation) - deliberately not built here, since CAM Message mode is both the accurate
 *  path and the one ArduPilot's own docs recommend; Time Offset mode is a possible future
 *  addition, not a gap in this one.
 *
 *  Desktop-only: reading a photo folder and writing geotagged copies needs real filesystem
 *  access, unavailable in the plain browser build - same constraint ArduPilot Setup's live
 *  vehicle connections already have (see isTauriRuntime's own doc comment). */
export function GeoTagView() {
  const { t } = useTranslation();
  const file = useFileStore((s) => s.file);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [photoNames, setPhotoNames] = useState<string[] | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [useAmslAltitude, setUseAmslAltitude] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [writeResult, setWriteResult] = useState<WriteResult | null>(null);

  const { data: camTags, isLoading } = useDerivedFromFile<CamGeoTag[]>(file, async (_name, buf) => {
    const worker = getCoreWorker();
    return worker.extractCamGeoTags(buf);
  });

  // Real bug fix: the picked photo folder used to survive a file change untouched. `camTags`
  // re-derives correctly against the new file via useDerivedFromFile, but `countMismatch` only
  // ever compared photo COUNT to CAM-record count - if a newly-loaded log happened to have the
  // same CAM-record count as the still-selected folder's photo count, `canGeoTag` went true
  // with zero warning and would silently write the WRONG flight's GPS/altitude into that
  // folder's EXIF data. Resetting the folder selection here (same "adjust state during render"
  // pattern GraphsView already uses for its own per-file UI state) forces a deliberate re-pick
  // against the newly-loaded log instead.
  const [resetKeyFile, setResetKeyFile] = useState(file);
  if (file !== resetKeyFile) {
    setResetKeyFile(file);
    setFolderPath(null);
    setPhotoNames(null);
    setPickError(null);
    setProgress(null);
    setWriteResult(null);
  }

  const tauriAvailable = isTauriRuntime();
  const countMismatch = photoNames !== null && camTags !== null && photoNames.length !== camTags.length;
  const canGeoTag = !countMismatch && photoNames !== null && camTags !== null && camTags.length > 0 && progress === null;

  async function handlePickFolder() {
    setPickError(null);
    setWriteResult(null);
    try {
      const picked = await open({ directory: true, multiple: false });
      if (!picked) return;
      await invoke("grant_geotag_folder_access", { path: picked });
      const entries = await readDir(picked);
      const names = entries
        .filter((e) => e.isFile && IMAGE_NAME_PATTERN.test(e.name))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
      setFolderPath(picked);
      setPhotoNames(names);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleGeoTag() {
    if (!folderPath || !photoNames || !camTags || photoNames.length !== camTags.length) return;
    setWriteResult(null);
    setProgress({ done: 0, total: photoNames.length });

    const outDir = await join(folderPath, GEOTAGGED_SUBFOLDER);
    if (!(await exists(outDir))) await mkdir(outDir);

    let succeeded = 0;
    const failed: string[] = [];
    for (let i = 0; i < photoNames.length; i++) {
      const name = photoNames[i]!;
      try {
        const srcPath = await join(folderPath, name);
        const original = await readFile(srcPath);
        const tagged = geotagJpegBytes(original, camTags[i]!, { useAmslAltitude });
        const dstPath = await join(outDir, name);
        await writeFile(dstPath, tagged);
        succeeded++;
      } catch (err) {
        failed.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
      setProgress({ done: i + 1, total: photoNames.length });
    }

    setProgress(null);
    setWriteResult({ succeeded, failed });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("geotag.heading")}</CardTitle>
        <CardDescription>{t("geotag.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!tauriAvailable ? (
          <Alert variant="info">
            <AlertDescription>{t("geotag.desktopOnly")}</AlertDescription>
          </Alert>
        ) : (
          <>
            {isLoading || camTags === null ? (
              <p className="text-sm text-muted-foreground">{t("geotag.loadingLog")}</p>
            ) : camTags.length === 0 ? (
              <Alert variant="warning">
                <AlertDescription>{t("geotag.noCamRecords")}</AlertDescription>
              </Alert>
            ) : (
              <p className="text-sm text-muted-foreground">{t("geotag.camRecordCount", { count: camTags.length })}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => void handlePickFolder()} disabled={progress !== null}>
                {t("geotag.pickFolder")}
              </Button>
              {folderPath && <span className="font-mono text-xs text-muted-foreground">{folderPath}</span>}
            </div>

            {pickError && (
              <Alert variant="destructive">
                <AlertDescription>{pickError}</AlertDescription>
              </Alert>
            )}

            {photoNames !== null && (
              <p className="text-sm text-muted-foreground">{t("geotag.photoCount", { count: photoNames.length })}</p>
            )}

            {countMismatch && (
              <Alert variant="destructive">
                <AlertDescription>
                  {t("geotag.countMismatch", { photos: photoNames.length, cam: camTags.length })}
                </AlertDescription>
              </Alert>
            )}

            {photoNames !== null && camTags !== null && !countMismatch && camTags.length > 0 && (
              <>
                <label className="flex w-fit items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useAmslAltitude}
                    onChange={(e) => setUseAmslAltitude(e.target.checked)}
                  />
                  {t("geotag.useAmslAltitude")}
                </label>

                <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead>{t("geotag.table.photo")}</TableHead>
                        <TableHead>{t("geotag.table.lat")}</TableHead>
                        <TableHead>{t("geotag.table.lng")}</TableHead>
                        <TableHead>{t("geotag.table.alt")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {photoNames.map((name, i) => {
                        const tag = camTags[i]!;
                        const alt = useAmslAltitude ? tag.altMsl : tag.altRel;
                        return (
                          <TableRow key={name}>
                            <TableCell className="font-mono text-xs">{name}</TableCell>
                            <TableCell className="font-mono text-xs">{tag.lat.toFixed(6)}</TableCell>
                            <TableCell className="font-mono text-xs">{tag.lng.toFixed(6)}</TableCell>
                            <TableCell className="font-mono text-xs">{alt.toFixed(1)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <Button type="button" onClick={() => void handleGeoTag()} disabled={!canGeoTag}>
                  {t("geotag.geotagImages")}
                </Button>
              </>
            )}

            {progress && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">{t("geotag.writing", { done: progress.done, total: progress.total })}</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {writeResult && (
              <Alert variant={writeResult.failed.length === 0 ? "good" : "warning"}>
                <AlertDescription>
                  <p>{t("geotag.done", { succeeded: writeResult.succeeded, total: writeResult.succeeded + writeResult.failed.length, folder: `${folderPath}/${GEOTAGGED_SUBFOLDER}` })}</p>
                  {writeResult.failed.length > 0 && (
                    <ul className="mt-1 list-inside list-disc font-mono text-xs">
                      {writeResult.failed.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
