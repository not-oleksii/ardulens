import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
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

// A full ArduCopter/ArduPlane parameter list is 1000-1700+ entries - rendering every row's DOM
// (even with the batched store flush in ArduPilotSetupView.tsx) meant reconciling a
// 13,000+-node table on every flush during a load, which was enough main-thread work over a
// real serial connection to make the whole window report "Not Responding" in Windows. Only the
// rows actually scrolled into view are rendered (see rowVirtualizer below) - the rest exist
// only as `filtered` data, not DOM.
const ROW_HEIGHT_PX = 36;
// Every row is a single, non-wrapping line, so a fixed row height is always accurate and
// there's no need for react-virtual's dynamic measureElement.
const COLUMN_WIDTHS = "22% 18% 60%"; // Name, Value, Description - a CSS grid-template-columns value

// The virtualized rows are plain CSS Grid divs (role="row"/"cell"), not a native <table>. A
// native <table> was tried first with table-layout: fixed on both header and (per-row)
// body - but a <tbody> with display: block (required so react-virtual can absolutely-position
// individual rows by scroll offset) is still, in every tested browser, treated as an anonymous
// cell inside the *outer* table's fixed-layout column grid: its width silently collapses to
// the first column's width (22%) no matter what width is set on it directly, since
// table-layout: fixed only reads column widths from the table's first row and ignores
// everything after. CSS Grid has no such quirk - the same COLUMN_WIDTHS template on the header
// row and every body row keeps them aligned with no special-casing.
const CELL_STYLE: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };

export function ParametersPanel({ vehicleType, onLoadParameters, onRequestMissing, onSetParam }: ParametersPanelProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const expectedCount = useMavlinkParameterStore((s) => s.expectedCount);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 12,
  });

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

  // Exports every currently-loaded parameter as a plain NAME,VALUE file (the same convention
  // Mission Planner and other GCS's use) - a local backup of the vehicle's exact configuration
  // at this moment, independent of the vehicle's own persistent storage.
  function handleSaveToFile() {
    const lines = entries.map((p) => `${p.name},${p.value}`).join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ardulens-params-${vehicleFolder}-${new Date().toISOString().slice(0, 10)}.param`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLoadFromFileClick() {
    fileInputRef.current?.click();
  }

  // Parses a NAME,VALUE param file and stages every entry that both (a) names a param this
  // vehicle actually has loaded (so its type is known - an unrecognized name can't be safely
  // written) and (b) differs from its current value, into the SAME pendingChanges the manual
  // inline editor uses. Nothing is written to the vehicle here - the user still reviews the
  // full From/To list in the existing confirm dialog and clicks "Save all" themselves, exactly
  // like every other edit path in this panel.
  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // clears the input so selecting the same file again still fires onChange
    if (!file) return;
    const text = await file.text();
    const loaded: Record<string, number> = {};
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const [name, valueStr] = line.split(",").map((part) => part.trim());
      if (!name || valueStr === undefined) continue;
      const value = Number(valueStr);
      if (!Number.isFinite(value)) continue;
      const existing = params[name];
      if (!existing || existing.value === value) continue;
      loaded[name] = value;
    }
    setPendingChanges((prev) => ({ ...prev, ...loaded }));
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
          {hasStarted && (
            <>
              <Button type="button" size="sm" variant="outline" onClick={handleSaveToFile}>
                {t("ardupilotSetup.parameters.saveToFile")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={handleLoadFromFileClick}>
                {t("ardupilotSetup.parameters.loadFromFile")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".param,.txt"
                data-testid="param-file-input"
                className="hidden"
                onChange={(e) => void handleFileSelected(e)}
              />
            </>
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

      {hasStarted && !isComplete && (
        <div data-testid="param-load-progress" className="h-1.5 w-full shrink-0 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${expectedCount ? Math.min(100, (receivedCount / expectedCount) * 100) : 0}%` }}
          />
        </div>
      )}

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
            <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
              <div role="table" className="w-full text-sm">
                <div role="rowgroup" className="sticky top-0 z-10 bg-card">
                  <div role="row" className="grid border-b border-border" style={{ gridTemplateColumns: COLUMN_WIDTHS }}>
                    <div role="columnheader" className="h-9 px-3 text-left align-middle font-medium text-muted-foreground" style={CELL_STYLE}>
                      {t("ardupilotSetup.parameters.name")}
                    </div>
                    <div role="columnheader" className="h-9 px-3 text-left align-middle font-medium text-muted-foreground" style={CELL_STYLE}>
                      {t("ardupilotSetup.parameters.value")}
                    </div>
                    <div role="columnheader" className="h-9 px-3 text-left align-middle font-medium text-muted-foreground" style={CELL_STYLE}>
                      {t("ardupilotSetup.parameters.description")}
                    </div>
                  </div>
                </div>
                {/* Only the rows actually scrolled into view (see rowVirtualizer above) get
                    real DOM nodes - the rest of `filtered` stays plain data. This rowgroup's
                    own relative positioning is what lets rows be absolutely positioned by
                    scroll offset; each row shares the exact same COLUMN_WIDTHS grid template as
                    the header above so their cells line up (see the CSS Grid comment above). */}
                <div role="rowgroup" style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const p = filtered[virtualRow.index]!;
                    const doc = docs?.[p.name];
                    const isModified = pendingChanges[p.name] !== undefined;
                    const shownValue = pendingChanges[p.name] ?? p.value;

                    return (
                      <div
                        key={p.name}
                        role="row"
                        className={cn("grid border-b border-border", "hover:bg-muted/50")}
                        style={{
                          gridTemplateColumns: COLUMN_WIDTHS,
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <div role="cell" className="px-3 py-2 font-mono" style={CELL_STYLE}>
                          {p.name}
                        </div>
                        <div role="cell" className="px-3 py-2 font-mono" style={CELL_STYLE}>
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
                        </div>
                        <div role="cell" className="px-3 py-2" style={CELL_STYLE}>
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
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
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
