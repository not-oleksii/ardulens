import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  type ParamDoc,
  type ParamDocsMap,
} from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { useMavlinkParamDefaultsStore } from "../../stores/mavlinkParamDefaultsStore/mavlinkParamDefaultsStore";

interface ParametersPanelProps {
  vehicleType: MavType;
  onLoadParameters: () => void;
  onRequestMissing: () => void;
  onSetParam: (name: string, value: number, type: MavParamType) => void;
  onLoadParamDefaults: () => void;
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
// Column order matches Mission Planner's own Full Parameter List: Name, Value, Default, Units,
// Options, Description - a CSS grid-template-columns value.
const COLUMN_WIDTHS = "16% 9% 9% 6% 13% 47%";

/** Formats a param.pck default the same way the raw Value column already displays a live
 *  value (see the plain `{shownValue}` render below) - kept as its own function only so the
 *  "no default known yet" fallback lives in one place. */
function formatDefault(defaults: Record<string, number> | null, name: string): string {
  if (!defaults || !(name in defaults)) return "-";
  return String(defaults[name]);
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

// Mission Planner's own "Full Parameter List" tree groups by the same simple heuristic: the
// param name's segment before its first underscore (ACRO_BAL_PITCH/ACRO_RP_RATE -> "ACRO",
// SERVO1_FUNCTION -> "SERVO1"). No metadata needed - ArduPilot's own naming convention already
// encodes which library/subsystem a param belongs to this way.
function categoryPrefix(name: string): string {
  const idx = name.indexOf("_");
  return idx === -1 ? name : name.slice(0, idx);
}

type CategorySelection = { kind: "all" } | { kind: "group"; prefix: string } | { kind: "param"; name: string };

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

// The Options column mirrors Mission Planner's own (enum code:label pairs, or a min-max range
// for bounded non-enum params) - condensed to one line since every row here has a fixed height
// (see ROW_HEIGHT_PX above), with the untruncated text still reachable via the cell's title
// tooltip, same pattern the Description column already uses for its full documentation text.
function optionsSummary(doc: ParamDoc | undefined): string {
  if (doc?.values) return Object.entries(doc.values).map(([code, label]) => `${code}: ${label}`).join(", ");
  if (doc?.range) return `${doc.range.min} - ${doc.range.max}`;
  return "-";
}

export function ParametersPanel({
  vehicleType,
  onLoadParameters,
  onRequestMissing,
  onSetParam,
  onLoadParamDefaults,
}: ParametersPanelProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const expectedCount = useMavlinkParameterStore((s) => s.expectedCount);
  const defaultsPhase = useMavlinkParamDefaultsStore((s) => s.phase);
  const defaultsBytesReceived = useMavlinkParamDefaultsStore((s) => s.bytesReceived);
  const defaultsTotalBytes = useMavlinkParamDefaultsStore((s) => s.totalBytes);
  const defaults = useMavlinkParamDefaultsStore((s) => s.defaults);
  const defaultsError = useMavlinkParamDefaultsStore((s) => s.error);
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
  const [categorySelection, setCategorySelection] = useState<CategorySelection>({ kind: "all" });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false);
  // Betaflight/Mission Planner both let a user isolate just the params that have actually been
  // tuned away from firmware defaults - only meaningful once real default values are in
  // (defaults !== null), so the toggle itself only appears at that point (see the search row
  // below) rather than existing in a permanently-disabled state before that.
  const [onlyModified, setOnlyModified] = useState(false);

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

  // A group with only one member is shown as a plain leaf (its full name), not a one-item
  // folder - matches Mission Planner's own tree (e.g. a lone BATT2_MONITOR sits at the top
  // level, not nested under an otherwise-empty "BATT2" folder).
  const categories = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of entries) {
      const prefix = categoryPrefix(p.name);
      const names = map.get(prefix);
      if (names) names.push(p.name);
      else map.set(prefix, [p.name]);
    }
    return Array.from(map.entries())
      .map(([prefix, names]) => ({ prefix, names }))
      .sort((a, b) => a.prefix.localeCompare(b.prefix));
  }, [entries]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((p) => {
      if (query && !p.name.toLowerCase().includes(query)) return false;
      // A param with no known default (defaults downloaded but this name wasn't in the file,
      // or defaults never downloaded at all) is excluded rather than treated as "changed" -
      // "changed from default" shouldn't include "we don't actually know the default."
      if (onlyModified && (!defaults || !(p.name in defaults) || p.value === defaults[p.name])) return false;
      if (categorySelection.kind === "param") return p.name === categorySelection.name;
      if (categorySelection.kind === "group") return categoryPrefix(p.name) === categorySelection.prefix;
      return true;
    });
  }, [entries, search, categorySelection, onlyModified, defaults]);

  function selectGroup(prefix: string) {
    setCategorySelection({ kind: "group", prefix });
  }

  // Driven by Collapsible's own onOpenChange (the new boolean it reports), not a manual toggle -
  // its trigger button also calls selectGroup on the same click (see the JSX below), and having
  // both independently set the same "add to expandedGroups" outcome (rather than one setting,
  // the other flipping) would otherwise re-close a group the instant it opens.
  function setGroupExpanded(prefix: string, open: boolean) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (open) next.add(prefix);
      else next.delete(prefix);
      return next;
    });
  }
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
          {hasStarted && (defaultsPhase === "idle" || defaultsPhase === "error") && (
            <Button type="button" size="sm" variant="outline" onClick={onLoadParamDefaults}>
              {t(defaultsPhase === "error" ? "ardupilotSetup.parameters.retryDefaults" : "ardupilotSetup.parameters.loadDefaults")}
            </Button>
          )}
          {(defaultsPhase === "opening" || defaultsPhase === "downloading") && (
            <span className="font-mono text-xs text-muted-foreground">
              {t("ardupilotSetup.parameters.defaultsLoading", {
                received: formatBytes(defaultsBytesReceived),
                total: defaultsTotalBytes ? formatBytes(defaultsTotalBytes) : "?",
              })}
            </span>
          )}
          {defaultsPhase === "error" && defaultsError && (
            <span className="text-xs text-destructive" title={defaultsError}>
              {t("ardupilotSetup.parameters.defaultsErrorLabel")}
            </span>
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
          <div className="flex shrink-0 items-center gap-3">
            <Input
              className="min-w-0 flex-1"
              placeholder={t("ardupilotSetup.parameters.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {defaults && (
              <label className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap">
                <input type="checkbox" checked={onlyModified} onChange={(e) => setOnlyModified(e.target.checked)} />
                {t("ardupilotSetup.parameters.onlyModifiedFromDefault")}
              </label>
            )}
          </div>
          {docsLoading && (
            <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.parameters.descriptionsLoading")}</p>
          )}
          {docsFailed && (
            <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.parameters.descriptionsUnavailable")}</p>
          )}
          <div className="flex min-h-0 flex-1 gap-3">
            <aside
              className={cn(
                "flex shrink-0 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border p-2",
                categoriesCollapsed ? "w-10" : "w-48",
              )}
            >
              <div className={cn("flex items-center", categoriesCollapsed ? "justify-center" : "justify-between")}>
                {!categoriesCollapsed && (
                  <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
                    {t("ardupilotSetup.parameters.categoriesHeading")}
                  </h4>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label={t(categoriesCollapsed ? "ardupilotSetup.parameters.expandCategories" : "ardupilotSetup.parameters.collapseCategories")}
                  onClick={() => setCategoriesCollapsed((c) => !c)}
                >
                  {categoriesCollapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
                </Button>
              </div>
              {!categoriesCollapsed && (
                <>
                  <button
                    type="button"
                    className={cn(
                      "rounded-md px-2 py-1 text-left text-xs",
                      categorySelection.kind === "all" ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                    )}
                    onClick={() => setCategorySelection({ kind: "all" })}
                  >
                    {t("ardupilotSetup.parameters.allCategories")}
                  </button>
                  {/* Every prefix (even a lone param) renders as a collapsed-by-default folder,
                      not a bare leaf showing the param's full name - a leaf here would render
                      DOM text identical to that same param's row in the table below, which
                      broke every existing test that waits for a param to load via
                      findByText(paramName) (there's now nowhere else that name-only text can
                      come from before the user actually expands a folder). */}
                  {categories.map(({ prefix, names }) => (
                    <Collapsible
                      key={prefix}
                      open={expandedGroups.has(prefix)}
                      onOpenChange={(open) => setGroupExpanded(prefix, open)}
                    >
                      {/* A single trigger button both toggles expansion (Radix's own click
                          behavior, via the Collapsible's open/onOpenChange above) and filters
                          the table to this group (our own onClick) - one click does both,
                          rather than two adjacent buttons that could report the same
                          accessible name and become ambiguous to query. */}
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          onClick={() => selectGroup(prefix)}
                          className={cn(
                            "flex w-full items-center gap-1 rounded-md px-1 py-1 text-left text-xs",
                            categorySelection.kind === "group" && categorySelection.prefix === prefix
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-accent",
                          )}
                        >
                          {expandedGroups.has(prefix) ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span className="min-w-0 flex-1 truncate font-mono">{prefix}</span>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="ml-4 flex flex-col gap-0.5 border-l border-border pl-2">
                        {names.map((name) => (
                          <button
                            key={name}
                            type="button"
                            className={cn(
                              "truncate rounded-md px-2 py-1 text-left font-mono text-xs",
                              categorySelection.kind === "param" && categorySelection.name === name
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-accent",
                            )}
                            title={name}
                            onClick={() => setCategorySelection({ kind: "param", name })}
                          >
                            {name}
                          </button>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </>
              )}
            </aside>

            {filtered.length === 0 ? (
              <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.parameters.noMatches")}</p>
            ) : (
              <div ref={scrollContainerRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto rounded-lg border border-border">
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
                        {t("ardupilotSetup.parameters.default")}
                      </div>
                      <div role="columnheader" className="h-9 px-3 text-left align-middle font-medium text-muted-foreground" style={CELL_STYLE}>
                        {t("ardupilotSetup.parameters.units")}
                      </div>
                      <div role="columnheader" className="h-9 px-3 text-left align-middle font-medium text-muted-foreground" style={CELL_STYLE}>
                        {t("ardupilotSetup.parameters.options")}
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
                      const options = optionsSummary(doc);

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
                          <div role="cell" className="px-3 py-2 font-mono text-muted-foreground" style={CELL_STYLE}>
                            {formatDefault(defaults, p.name)}
                          </div>
                          <div role="cell" className="px-3 py-2 font-mono text-muted-foreground" style={CELL_STYLE}>
                            {doc?.units ?? "-"}
                          </div>
                          <div role="cell" className="px-3 py-2 text-muted-foreground" style={CELL_STYLE} title={options}>
                            {options}
                          </div>
                          <div role="cell" className="px-3 py-2" style={CELL_STYLE}>
                            {doc ? (
                              // The real documentation sentence(s), not just the short humanName
                              // title - CELL_STYLE truncates this to one line for the fixed row
                              // height virtualization needs (see the comment on ROW_HEIGHT_PX
                              // above), but the untruncated text is still reachable via this
                              // title tooltip, and the Read More link goes to the full official
                              // docs page for anything that needs more than a hover.
                              <span title={`${doc.humanName}: ${doc.documentation}`}>
                                <span className="font-semibold">{doc.humanName}</span>
                                {doc.documentation ? ` — ${doc.documentation} ` : " "}
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
          </div>
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
