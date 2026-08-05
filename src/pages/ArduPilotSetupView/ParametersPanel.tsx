import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MavParamType, MavType } from "../../mavlink/registry/registry";
import {
  fetchParamDocs,
  paramDocsPageUrl,
  vehicleFolderForMavType,
  type ArduPilotVehicleFolder,
  type ParamDocsMap,
} from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";

interface ParametersPanelProps {
  vehicleType: MavType;
  onLoadParameters: () => void;
  onRequestMissing: () => void;
  onSetParam: (name: string, value: number, type: MavParamType) => void;
}

export function ParametersPanel({ vehicleType, onLoadParameters, onRequestMissing, onSetParam }: ParametersPanelProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const expectedCount = useMavlinkParameterStore((s) => s.expectedCount);
  const [search, setSearch] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  // Edits are staged here (not sent) until "Save all" is confirmed - lets the user change
  // several parameters and review a single From/To list before anything reaches the vehicle.
  const [pendingChanges, setPendingChanges] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Both tagged with the folder they're for, so a stale result from a previous vehicle type
  // is never shown while the new one is still loading - without needing to reset state
  // synchronously inside the effect itself (which cascading-render lint rightly flags).
  const [docsState, setDocsState] = useState<{ folder: ArduPilotVehicleFolder; docs: ParamDocsMap } | null>(null);
  const [docsErrorFolder, setDocsErrorFolder] = useState<ArduPilotVehicleFolder | null>(null);

  const vehicleFolder = vehicleFolderForMavType(vehicleType);
  const docs = docsState?.folder === vehicleFolder ? docsState.docs : null;
  const docsFailed = docsErrorFolder === vehicleFolder;
  const docsLoading = !docs && !docsFailed;

  useEffect(() => {
    let cancelled = false;
    fetchParamDocs(vehicleFolder)
      .then((result) => {
        if (!cancelled) setDocsState({ folder: vehicleFolder, docs: result });
      })
      .catch(() => {
        // Descriptions are a nice-to-have enhancement - the param list itself works fine
        // without them, but the failure is surfaced (rather than silently doing nothing) so
        // a real fetch problem is visible instead of looking like the feature is just broken.
        if (!cancelled) setDocsErrorFolder(vehicleFolder);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleFolder]);

  // Sorting/filtering a full (1000+ param) list is cheap once, but re-doing it on every
  // render (e.g. while typing in an unrelated field) adds up - memoized so it only re-runs
  // when the underlying data or the search term actually changes.
  const entries = useMemo(() => Object.values(params).sort((a, b) => a.name.localeCompare(b.name)), [params]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? entries.filter((p) => p.name.toLowerCase().includes(query)) : entries;
  }, [entries, search]);
  const receivedCount = entries.length;
  const hasStarted = expectedCount !== null || receivedCount > 0;
  const isComplete = expectedCount !== null && receivedCount >= expectedCount;
  const pendingEntries = Object.entries(pendingChanges);
  const hasPendingChanges = pendingEntries.length > 0;

  function startEdit(name: string, currentValue: number) {
    setEditingName(name);
    setEditingValue(String(currentValue));
  }

  function commitEdit(name: string) {
    setEditingName(null);
    const parsed = Number(editingValue);
    if (!Number.isFinite(parsed)) return;
    const original = params[name]?.value;
    setPendingChanges((prev) => {
      const next = { ...prev };
      if (original !== undefined && parsed === original) {
        delete next[name]; // editing back to the original value un-stages it
      } else {
        next[name] = parsed;
      }
      return next;
    });
  }

  function handleResetAll() {
    setPendingChanges({});
  }

  function handleConfirmSaveAll() {
    for (const [name, value] of pendingEntries) {
      const type = params[name]?.type;
      if (type !== undefined) onSetParam(name, value, type);
    }
    setPendingChanges({});
    setConfirmOpen(false);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.parameters.heading")}</h3>
        <div className="flex items-center gap-2">
          {hasStarted && (
            <span className="font-mono text-xs text-muted-foreground">
              {t("ardupilotSetup.parameters.progress", { received: receivedCount, total: expectedCount ?? "?" })}
            </span>
          )}
          {hasStarted && !isComplete && (
            <Button type="button" size="sm" variant="outline" onClick={onRequestMissing}>
              {t("ardupilotSetup.parameters.requestMissing")}
            </Button>
          )}
          {!hasStarted && (
            <Button type="button" size="sm" onClick={onLoadParameters}>
              {t("ardupilotSetup.parameters.load")}
            </Button>
          )}
          {hasPendingChanges && (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={handleResetAll}>
                {t("ardupilotSetup.parameters.reset")}
              </Button>
              <Button type="button" size="sm" onClick={() => setConfirmOpen(true)}>
                {t("ardupilotSetup.parameters.saveAll", { count: pendingEntries.length })}
              </Button>
            </>
          )}
        </div>
      </div>

      {hasStarted && (
        <>
          <Input
            className="shrink-0"
            placeholder={t("ardupilotSetup.parameters.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {docsLoading && (
            <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.parameters.descriptionsLoading")}</p>
          )}
          {docsFailed && (
            <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.parameters.descriptionsUnavailable")}</p>
          )}
          {filtered.length === 0 ? (
            <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.parameters.noMatches")}</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>{t("ardupilotSetup.parameters.name")}</TableHead>
                    <TableHead>{t("ardupilotSetup.parameters.value")}</TableHead>
                    <TableHead>{t("ardupilotSetup.parameters.description")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const doc = docs?.[p.name];
                    const isModified = pendingChanges[p.name] !== undefined;
                    const shownValue = pendingChanges[p.name] ?? p.value;

                    return (
                      <TableRow key={p.name}>
                        <TableCell className="font-mono">{p.name}</TableCell>
                        <TableCell className="font-mono">
                          {editingName === p.name ? (
                            <Input
                              autoFocus
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onBlur={() => commitEdit(p.name)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit(p.name);
                                if (e.key === "Escape") setEditingName(null);
                              }}
                              className="h-7 w-32"
                            />
                          ) : (
                            <button type="button" className="hover:underline" onClick={() => startEdit(p.name, shownValue)}>
                              {shownValue}
                            </button>
                          )}
                          {isModified && (
                            <span className="ml-2 text-xs text-primary">{t("ardupilotSetup.parameters.modified")}</span>
                          )}
                          {!isModified && p.dirty && (
                            <span className="ml-2 text-xs text-muted-foreground">{t("ardupilotSetup.parameters.dirty")}</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          {doc ? (
                            <span title={doc.documentation}>
                              {doc.humanName}{" "}
                              <a
                                href={paramDocsPageUrl(vehicleFolder, p.name)}
                                target="_blank"
                                rel="noreferrer"
                                className="whitespace-nowrap text-primary underline-offset-4 hover:underline"
                              >
                                {t("graphs.params.readMore")}
                              </a>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.parameters.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("ardupilotSetup.parameters.confirmDescription", { count: pendingEntries.length })}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ardupilotSetup.parameters.name")}</TableHead>
                  <TableHead>{t("ardupilotSetup.parameters.from")}</TableHead>
                  <TableHead>{t("ardupilotSetup.parameters.to")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingEntries.map(([name, value]) => (
                  <TableRow key={name}>
                    <TableCell className="font-mono">{name}</TableCell>
                    <TableCell className="font-mono">{params[name]?.value}</TableCell>
                    <TableCell className="font-mono">{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("ardupilotSetup.parameters.cancel")}
            </Button>
            <Button type="button" onClick={handleConfirmSaveAll}>
              {t("ardupilotSetup.parameters.confirmSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
