import { SlidersHorizontal } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { runAdvisors } from "../../analysis/advisors/registry/registry";
import { METRICS, computeRow } from "../../analysis/metrics/metrics";
import { FindingsBadge } from "../../components/FindingsBadge/FindingsBadge";
import { useDerivedFromFile } from "../../hooks/useDerivedFromFile/useDerivedFromFile";
import { copyText } from "../../services/clipboard/clipboard";
import { getCoreWorker } from "../../services/coreWorkerClient/coreWorkerClient";
import { useFileStore } from "../../stores/fileStore/fileStore";
import type { LoadedFile } from "../../stores/fileStore/types";
import { isParsedError, isParsedFlights, isParsedInfo, type Flight, type ParseResult } from "../../types";
import { trackStats } from "../../utils/geo/geo";

const DEFAULT_COLUMN_INDICES = METRICS.map((_, i) => i).filter((i) => METRICS[i]!.defaultVisible !== false);
const BOARD_COLUMN_INDEX = 0; // always shown first, identifies the row - not toggleable

export function LogsView() {
  const { t } = useTranslation();
  const file = useFileStore((s) => s.file);
  const [boardFilter, setBoardFilter] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [columnIndices, setColumnIndices] = useState<number[]>(DEFAULT_COLUMN_INDICES);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { data: parsed, isLoading } = useDerivedFromFile<ParseResult>(file, async (name, buf) => {
    try {
      return await getCoreWorker().parseFile(name, buf);
    } catch (err) {
      return { error: t("logs.messages.parseError", { message: err instanceof Error ? err.message : String(err) }) };
    }
  });

  const [forced, setForced] = useState<{ file: LoadedFile; result: ParseResult } | null>(null);
  const [forcing, setForcing] = useState(false);

  // Reset the per-file UI selections whenever a different file is loaded - same "adjust state
  // during render" pattern GraphsView/GeoTagView already use, so a board filter, forced-parse
  // result, or copied-row highlight from the PREVIOUS file never lingers onto a new one (e.g. a
  // board filter that happens to also exist in the new file would otherwise silently keep
  // filtering it, with no indication the filter is stale rather than intentional).
  const [resetKeyFile, setResetKeyFile] = useState(file);
  if (file !== resetKeyFile) {
    setResetKeyFile(file);
    setBoardFilter("");
    setCopiedKey(null);
    setColumnIndices(DEFAULT_COLUMN_INDICES);
    setColumnsOpen(false);
    setForced(null);
    setForcing(false);
  }

  const forcedResult = forced && forced.file === file ? forced.result : null;
  const result = forcedResult ?? parsed;

  async function handleShowAnyway() {
    if (!file) return;
    setForcing(true);
    try {
      const r = await getCoreWorker().parseFile(file.name, file.buf, undefined, { forceWholeFile: true });
      setForced({ file, result: r });
    } finally {
      setForcing(false);
    }
  }

  async function handleCopy(key: string, text: string) {
    await copyText(text);
    setCopiedKey(key);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedKey(null), 1500);
  }

  function toggleColumn(index: number) {
    if (index === BOARD_COLUMN_INDEX) return;
    setColumnIndices((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));
  }

  function resetColumns() {
    setColumnIndices(DEFAULT_COLUMN_INDICES);
  }

  const view = useMemo(() => {
    if (!result) return null;
    if (isParsedError(result) || isParsedInfo(result)) {
      return { flights: [] as Flight[], boards: [] as string[], fmt: null, all: [] as Flight[] };
    }

    const filter = boardFilter.trim();
    const all = result.flights;
    const flights = filter ? all.filter((f) => String(f.board).includes(filter)) : all;
    return { flights, boards: result.boards, fmt: result.fmt, all };
  }, [result, boardFilter]);

  const computed = useMemo(() => (view ? view.flights.map((f) => ({ f, r: computeRow(f) })) : []), [view]);
  const rowFindings = useMemo(() => computed.map((x) => runAdvisors(x.f)), [computed]);
  // A per-row FindingsBadge is easy to miss on a long multi-board table - this rolls every
  // row's own findings up into one line above the table, so a critical/warning issue anywhere
  // is visible without scrolling through every row first.
  const findingsSummary = useMemo(() => {
    let critical = 0;
    let warning = 0;
    let flightsAffected = 0;
    for (const findings of rowFindings) {
      if (findings.length === 0) continue;
      flightsAffected++;
      for (const f of findings) {
        if (f.severity === "critical") critical++;
        else if (f.severity === "warning") warning++;
      }
    }
    return { critical, warning, flightsAffected };
  }, [rowFindings]);

  const displayedColumns = useMemo(
    () => columnIndices.map((i) => t(`metrics.${METRICS[i]!.key}`)),
    [columnIndices, t],
  );
  const displayedRows = useMemo(
    () => computed.map((x) => columnIndices.map((i) => x.r.row[i]!)),
    [computed, columnIndices],
  );
  const hasApproximateColumn = columnIndices.some((i) => METRICS[i]?.approximate);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("logs.heading")}</CardTitle>
        <CardDescription>{t("logs.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="link" className="h-auto p-0 text-sm">
              {t("logs.help.summary")}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 flex flex-col gap-2 text-sm text-muted-foreground">
            <p>{t("logs.help.intro")}</p>
            <ol className="list-decimal space-y-1 pl-5">
              {(t("logs.help.steps", { returnObjects: true }) as string[]).map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <label htmlFor="board-filter" className="text-xs text-muted-foreground">
            {t("logs.filter.label")}
          </label>
          <Input
            id="board-filter"
            value={boardFilter}
            onChange={(e) => setBoardFilter(e.target.value)}
            placeholder={t("logs.filter.placeholder")}
            className="max-w-sm"
          />
          <p className="text-xs text-muted-foreground">{t("logs.filter.hint")}</p>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          {isLoading && <p className="text-sm text-muted-foreground">{t("logs.drop.parsing")}</p>}

          {result && isParsedError(result) && (
            <Alert variant="destructive">
              <AlertDescription>{result.error}</AlertDescription>
            </Alert>
          )}
          {result && isParsedInfo(result) && (
            <Alert variant="info">
              <AlertDescription className="flex flex-wrap items-center gap-2">
                <span>{result.info}</span>
                {!forcedResult && (
                  <Button variant="outline" size="sm" onClick={() => void handleShowAnyway()} disabled={forcing}>
                    {forcing ? t("logs.showAnyway.loading") : t("logs.showAnyway.button")}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          {result && view && isParsedFlights(result) && (
            <div className="flex flex-col gap-3">
              <Alert variant="info">
                <AlertDescription>
                  {t("logs.messages.summary", {
                    name: file?.name,
                    fmt: view.fmt,
                    shown: view.flights.length,
                    total: view.all.length,
                  })}
                </AlertDescription>
              </Alert>

              {/* Every format/finding/data-quality note about the CURRENTLY shown flights, as
                  one bulleted banner instead of one full-width Alert per note - up to 4 of these
                  used to stack (this app never has both multiBoard and binManualTime at once,
                  since a file is exactly one format, but findingsRollup and teleportRemoved can
                  each independently join whichever format note applies), reading as a wall of
                  same-weight colored banners before the user ever reached the table. Severity
                  follows the worst note present, so a critical finding still reads as urgent. */}
              {(() => {
                const notes: { key: string; text: string; severity: "warning" | "destructive" }[] = [];
                if (view.fmt === "skylog" && view.boards.length > 1) {
                  notes.push({ key: "multiBoard", text: t("logs.messages.multiBoard", { boards: view.boards.join(", ") }), severity: "warning" });
                }
                if (view.fmt === "bin") {
                  notes.push({ key: "binManualTime", text: t("logs.messages.binManualTime"), severity: "warning" });
                }
                const removed = view.flights.reduce((sum, f) => sum + trackStats(f).removed, 0);
                if (removed > 0) {
                  notes.push({ key: "teleportRemoved", text: t("logs.messages.teleportRemoved", { count: removed }), severity: "warning" });
                }
                if (findingsSummary.flightsAffected > 0) {
                  notes.push({
                    key: "findingsRollup",
                    text: t("logs.messages.findingsRollup", {
                      count: findingsSummary.flightsAffected,
                      total: view.flights.length,
                      critical: findingsSummary.critical,
                      warning: findingsSummary.warning,
                    }),
                    severity: findingsSummary.critical > 0 ? "destructive" : "warning",
                  });
                }
                if (notes.length === 0) return null;
                const worst = notes.some((n) => n.severity === "destructive") ? "destructive" : "warning";
                return (
                  <Alert variant={worst}>
                    <AlertDescription>
                      <ul className="list-disc space-y-0.5 pl-4">
                        {notes.map((n) => (
                          <li key={n.key}>{n.text}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                );
              })()}

              {boardFilter.trim() && view.flights.length === 0 && (
                <Alert variant="warning">
                  <AlertDescription>
                    {t("logs.messages.noMatch", { filter: boardFilter.trim(), boards: view.boards.join(", ") })}
                  </AlertDescription>
                </Alert>
              )}

              {view.all.length > 0 && (
                <Collapsible open={columnsOpen} onOpenChange={setColumnsOpen}>
                  <div className="flex items-center justify-end">
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" aria-pressed={columnsOpen} className="gap-1.5">
                        <SlidersHorizontal className="h-4 w-4" />
                        {t("logs.columns.buttonLabel")}
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="mt-2 flex flex-col gap-2 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{t("logs.columns.heading")}</p>
                      <Button variant="ghost" size="sm" onClick={resetColumns}>
                        {t("logs.columns.reset")}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("logs.columns.hint")}</p>
                    <div className="flex flex-wrap gap-2">
                      {METRICS.map((metric, i) => {
                        if (i === BOARD_COLUMN_INDEX) return null;
                        const isSelected = columnIndices.includes(i);
                        return (
                          <Button
                            key={metric.key}
                            type="button"
                            variant={isSelected ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => toggleColumn(i)}
                            className="gap-1.5"
                          >
                            {isSelected && (
                              <span
                                aria-hidden
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive/15 text-xs font-bold text-destructive"
                              >
                                −
                              </span>
                            )}
                            {t(`metrics.${metric.key}`)}
                            {metric.approximate && <span className="text-muted-foreground"> ≈</span>}
                          </Button>
                        );
                      })}
                    </div>
                    {hasApproximateColumn && (
                      <p className="text-xs text-muted-foreground">{t("logs.columns.approximateNote")}</p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {displayedRows.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void handleCopy("all", displayedRows.map((r) => r.join("\t")).join("\n"))}
                    >
                      {copiedKey === "all" ? t("logs.actions.copied") : t("logs.actions.copyAll")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void handleCopy(
                          "allWithHeader",
                          [displayedColumns.join("\t"), ...displayedRows.map((r) => r.join("\t"))].join("\n"),
                        )
                      }
                    >
                      {copiedKey === "allWithHeader" ? t("logs.actions.copied") : t("logs.actions.copyAllWithHeader")}
                    </Button>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("logs.table.issuesHeading")}</TableHead>
                        {displayedColumns.map((col, ci) => (
                          <TableHead key={columnIndices[ci]}>
                            {col}
                            {METRICS[columnIndices[ci]!]?.approximate && <span> ≈</span>}
                          </TableHead>
                        ))}
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {computed.map((x, i) => (
                        <TableRow key={i} className={x.r.ground ? "text-muted-foreground" : undefined}>
                          <TableCell>
                            <FindingsBadge findings={rowFindings[i]!} />
                          </TableCell>
                          {displayedRows[i]!.map((v, ci) => {
                            const originalIndex = columnIndices[ci]!;
                            const isManual = x.r.manualCols.includes(originalIndex);
                            return (
                              <TableCell
                                key={ci}
                                className={
                                  ci === 0
                                    ? "font-bold text-primary"
                                    : isManual
                                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                      : undefined
                                }
                              >
                                {v || (isManual ? t("logs.table.manualValue") : "")}
                              </TableCell>
                            );
                          })}
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleCopy(`row-${i}`, displayedRows[i]!.join("\t"))}
                            >
                              {copiedKey === `row-${i}` ? t("logs.actions.copied") : t("logs.actions.copyRow")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-xs text-muted-foreground">
                    {view.fmt === "bin" ? t("logs.table.footerHintBin") : t("logs.table.footerHint")}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
