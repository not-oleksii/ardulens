import { Loader2, SlidersHorizontal } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { runAdvisors } from "../../analysis/advisors/registry/registry";
import { METRICS, computeRow } from "../../analysis/metrics/metrics";
import { FindingsBadge } from "../../components/FindingsBadge/FindingsBadge";
import { FlightBinBuilder } from "../../builders/FlightBinBuilder/FlightBinBuilder";
import { SkylogFileBuilder } from "../../builders/SkylogFileBuilder/SkylogFileBuilder";
import { copyText } from "../../services/clipboard/clipboard";
import { getCoreWorker } from "../../services/coreWorkerClient/coreWorkerClient";
import { isParsedError, isParsedFlights, isParsedInfo, type Flight, type ParseResult } from "../../types";
import { trackStats } from "../../utils/geo/geo";

interface LoadedResult {
  name: string;
  result: ParseResult;
}

const DEFAULT_COLUMN_INDICES = METRICS.map((_, i) => i).filter((i) => METRICS[i]!.defaultVisible !== false);
const BOARD_COLUMN_INDEX = 0; // always shown first, identifies the row - not toggleable

export function LogsView() {
  const { t } = useTranslation();
  const [boardFilter, setBoardFilter] = useState("");
  const [loaded, setLoaded] = useState<LoadedResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [columnIndices, setColumnIndices] = useState<number[]>(DEFAULT_COLUMN_INDICES);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function loadBuffer(name: string, buf: ArrayBuffer, boardOverride?: string) {
    setIsParsing(true);
    try {
      const result = await getCoreWorker().parseFile(name, buf, boardOverride ?? boardFilter.trim());
      setLoaded({ name, result });
    } catch (err) {
      setLoaded({
        name,
        result: { error: t("logs.messages.parseError", { message: err instanceof Error ? err.message : String(err) }) },
      });
    } finally {
      setIsParsing(false);
    }
  }

  async function handleFile(file: File) {
    await loadBuffer(file.name, await file.arrayBuffer());
  }

  function loadSampleBin() {
    // .bin has no board id of its own - a real user types it into the filter
    // field first; the sample button fills in a sensible default instead.
    const buf = new FlightBinBuilder().withVoltageCurve(25.2, 22.4, 23.0).withGpsTeleports(4).build();
    void loadBuffer("sample-flight.bin", buf, "3570");
  }

  function loadSampleSkylog() {
    const buf = new SkylogFileBuilder()
      .addBoard({ board: 3570, takeoffVoltage: 25.1, landingVoltage: 23.6 })
      .addBoard({ board: 3526, takeoffVoltage: 24.9, landingVoltage: 23.2 })
      .build();
    void loadBuffer("sample-log.skylog", buf);
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
    if (!loaded) return null;
    const { result } = loaded;
    if (isParsedError(result) || isParsedInfo(result)) {
      return { flights: [] as Flight[], boards: [] as string[], fmt: null, all: [] as Flight[] };
    }

    const filter = boardFilter.trim();
    const all = result.flights;
    const flights = filter ? all.filter((f) => String(f.board).includes(filter)) : all;
    return { flights, boards: result.boards, fmt: result.fmt, all };
  }, [loaded, boardFilter]);

  const computed = useMemo(() => (view ? view.flights.map((f) => ({ f, r: computeRow(f) })) : []), [view]);
  const rowFindings = useMemo(() => computed.map((x) => runAdvisors(x.f)), [computed]);

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
          <div
            role="button"
            aria-disabled={isParsing}
            tabIndex={isParsing ? -1 : 0}
            data-testid="log-dropzone"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-6 py-9 text-center transition-colors",
              isParsing && "pointer-events-none opacity-60",
              isDragging ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent",
            )}
          >
            {isParsing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
                <span className="font-semibold">{t("logs.drop.parsing")}</span>
              </>
            ) : (
              <>
                <span className="font-semibold">{t("logs.drop.title")}</span>
                <span className="text-sm text-muted-foreground">{t("logs.drop.subtitle")}</span>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".skylog,.log,.txt,.bin,.BIN"
            className="sr-only"
            data-testid="log-file-input"
            disabled={isParsing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={loadSampleBin} disabled={isParsing}>
              {t("logs.sample.bin")}
            </Button>
            <Button variant="outline" size="sm" onClick={loadSampleSkylog} disabled={isParsing}>
              {t("logs.sample.skylog")}
            </Button>
          </div>

          {loaded && isParsedError(loaded.result) && (
            <Alert variant="destructive">
              <AlertDescription>{loaded.result.error}</AlertDescription>
            </Alert>
          )}
          {loaded && isParsedInfo(loaded.result) && (
            <Alert variant="info">
              <AlertDescription>{loaded.result.info}</AlertDescription>
            </Alert>
          )}

          {loaded && view && isParsedFlights(loaded.result) && (
            <div className="flex flex-col gap-3">
              <Alert variant="info">
                <AlertDescription>
                  {t("logs.messages.summary", {
                    name: loaded.name,
                    fmt: view.fmt,
                    shown: view.flights.length,
                    total: view.all.length,
                  })}
                </AlertDescription>
              </Alert>

              {view.fmt === "skylog" && view.boards.length > 1 && (
                <Alert variant="warning">
                  <AlertDescription>
                    {t("logs.messages.multiBoard", { boards: view.boards.join(", ") })}
                  </AlertDescription>
                </Alert>
              )}

              {boardFilter.trim() && view.flights.length === 0 && (
                <Alert variant="warning">
                  <AlertDescription>
                    {t("logs.messages.noMatch", { filter: boardFilter.trim(), boards: view.boards.join(", ") })}
                  </AlertDescription>
                </Alert>
              )}

              {(() => {
                const removed = view.flights.reduce((sum, f) => sum + trackStats(f).removed, 0);
                return removed > 0 ? (
                  <Alert variant="warning">
                    <AlertDescription>{t("logs.messages.teleportRemoved", { count: removed })}</AlertDescription>
                  </Alert>
                ) : null;
              })()}

              {view.fmt === "bin" && (
                <Alert variant="warning">
                  <AlertDescription>{t("logs.messages.binManualTime")}</AlertDescription>
                </Alert>
              )}

              {view.all.length > 0 && (
                <Collapsible open={columnsOpen} onOpenChange={setColumnsOpen}>
                  <div className="flex items-center justify-end">
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={t("logs.columns.toggle")}
                        aria-pressed={columnsOpen}
                      >
                        <SlidersHorizontal className="h-4 w-4" />
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
