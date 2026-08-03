import { ChevronDown, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { runAdvisors } from "../../analysis/advisors/registry/registry";
import type { Finding } from "../../analysis/advisors/types";
import { getParamDoc } from "../../analysis/param-docs/param-docs";
import { isRawLog, isRawLogError, isRawLogInfo, type RawLogResult } from "../../analysis/raw-log/raw-log";
import { PRESETS, resolvePreset } from "../../analysis/raw-log/presets";
import { FlightBinBuilder } from "../../builders/FlightBinBuilder/FlightBinBuilder";
import { SkylogFileBuilder } from "../../builders/SkylogFileBuilder/SkylogFileBuilder";
import { FileDropzone } from "../../components/FileDropzone/FileDropzone";
import { FindingsBadge } from "../../components/FindingsBadge/FindingsBadge";
import { TimelineChart } from "../../components/TimelineChart/TimelineChart";
import type { TimelineSeriesInput } from "../../components/TimelineChart/types";
import { useFileLoader } from "../../hooks/useFileLoader/useFileLoader";
import { getCoreWorker } from "../../services/coreWorkerClient/coreWorkerClient";
import { isParsedFlights } from "../../types";

interface LoadedResult {
  name: string;
  result: RawLogResult;
  findings: Finding[];
}

const SERIES_COLORS = ["#3b82f6", "#f97316", "#22c55e", "#ef4444", "#a855f7", "#06b6d4", "#eab308", "#ec4899"];

export function GraphsView() {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<LoadedResult | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [paramFilter, setParamFilter] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  const { isParsing, stage, load, loadBuffer } = useFileLoader<LoadedResult>(async (name, buf) => {
    const worker = getCoreWorker();
    try {
      // Two independent parses of the same buffer: buildRawLog() for the chart/param
      // tree, parseFile() for the per-flight Sample model the advisors already know how
      // to check. A bit of duplicated work for .bin files, but keeps the advisors on the
      // same simple Flight model the Logs page uses instead of a second detection path.
      const [result, parseResult] = await Promise.all([worker.buildRawLog(name, buf), worker.parseFile(name, buf)]);
      const findings = isParsedFlights(parseResult) ? parseResult.flights.flatMap((f) => runAdvisors(f)) : [];
      return { name, result, findings };
    } catch (err) {
      return {
        name,
        result: { error: t("logs.messages.parseError", { message: err instanceof Error ? err.message : String(err) }) },
        findings: [],
      };
    }
  });

  function applyLoaded(result: LoadedResult) {
    setLoaded(result);
    setSelectedKeys([]);
    setParamFilter("");
    setOpenCategories(new Set());
  }

  function handleFile(file: File) {
    void load(file).then(applyLoaded);
  }

  function loadSampleBin() {
    const buf = new FlightBinBuilder().withVoltageCurve(25.2, 22.4, 23.0).build();
    void loadBuffer("sample-flight.bin", buf).then(applyLoaded);
  }

  function loadSampleSkylog() {
    const buf = new SkylogFileBuilder().addBoard({ board: 3570 }).build();
    void loadBuffer("sample-log.skylog", buf).then(applyLoaded);
  }

  function toggleParam(key: string) {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function removeParam(key: string) {
    setSelectedKeys((prev) => prev.filter((k) => k !== key));
  }

  function resetPlots() {
    setSelectedKeys([]);
  }

  function toggleCategoryOpen(key: string, open: boolean) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const rawLog = loaded && isRawLog(loaded.result) ? loaded.result : null;

  function applyPreset(candidateKeys: string[]) {
    setSelectedKeys((prev) => [...prev, ...candidateKeys.filter((k) => !prev.includes(k))]);
  }

  const isFiltering = paramFilter.trim().length > 0;
  const filteredCategories = useMemo(() => {
    if (!rawLog) return [];
    const needle = paramFilter.trim().toLowerCase();
    if (!needle) return rawLog.categories;
    return rawLog.categories
      .map((category) => ({
        ...category,
        params: category.params.filter((p) => p.label.toLowerCase().includes(needle)),
      }))
      .filter((category) => category.params.length > 0);
  }, [rawLog, paramFilter]);

  const applicablePresets = useMemo(() => {
    if (!rawLog) return [];
    return PRESETS.map((preset) => ({ preset, keys: resolvePreset(preset, rawLog.series) })).filter(
      (p): p is { preset: (typeof PRESETS)[number]; keys: string[] } => p.keys !== null,
    );
  }, [rawLog]);

  const series: TimelineSeriesInput[] = useMemo(() => {
    if (!rawLog) return [];
    return selectedKeys
      .filter((key) => rawLog.series[key])
      .map((key, i) => ({
        key,
        label: key,
        color: SERIES_COLORS[i % SERIES_COLORS.length]!,
        data: rawLog.series[key]!,
      }));
  }, [rawLog, selectedKeys]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("graphs.heading")}</CardTitle>
        <CardDescription>{t("graphs.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FileDropzone
          testId="graphs"
          accept=".skylog,.log,.txt,.bin,.BIN"
          isParsing={isParsing}
          stage={stage}
          onFile={handleFile}
          title={t("graphs.drop.title")}
          subtitle={t("graphs.drop.subtitle")}
          readingText={t("graphs.drop.reading")}
          parsingText={t("graphs.drop.parsing")}
        />

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadSampleBin} disabled={isParsing}>
            {t("logs.sample.bin")}
          </Button>
          <Button variant="outline" size="sm" onClick={loadSampleSkylog} disabled={isParsing}>
            {t("logs.sample.skylog")}
          </Button>
        </div>

        {loaded && isRawLogError(loaded.result) && (
          <Alert variant="destructive">
            <AlertDescription>{loaded.result.error}</AlertDescription>
          </Alert>
        )}
        {loaded && isRawLogInfo(loaded.result) && (
          <Alert variant="info">
            <AlertDescription>{loaded.result.info}</AlertDescription>
          </Alert>
        )}

        {loaded && rawLog && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">{t("graphs.findings.heading")}</span>
            <FindingsBadge findings={loaded.findings} />
          </div>
        )}

        {rawLog && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{t("graphs.plotsSetup.heading")}</h3>
                  {selectedKeys.length > 0 && (
                    <Button variant="ghost" size="icon" aria-label={t("graphs.plotsSetup.reset")} onClick={resetPlots}>
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {series.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("graphs.plotsSetup.empty")}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {series.map((s) => (
                      <li key={s.key} className="flex items-center gap-2 text-sm">
                        <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} />
                        <span className="flex-1 truncate">{s.label}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          aria-label={t("graphs.plotsSetup.remove", { param: s.label })}
                          onClick={() => removeParam(s.key)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {applicablePresets.length > 0 && (
                <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <h3 className="text-sm font-medium">{t("graphs.presets.heading")}</h3>
                  <div className="flex flex-col gap-1">
                    {applicablePresets.map(({ preset, keys }) => (
                      <Button
                        key={preset.key}
                        variant="ghost"
                        size="sm"
                        className="justify-start"
                        onClick={() => applyPreset(keys)}
                      >
                        {t(`graphs.presets.${preset.key}`)}
                      </Button>
                    ))}
                  </div>
                </section>
              )}

              <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <h3 className="text-sm font-medium">{t("graphs.params.heading")}</h3>
                <Input
                  value={paramFilter}
                  onChange={(e) => setParamFilter(e.target.value)}
                  placeholder={t("graphs.params.filterPlaceholder")}
                  aria-label={t("graphs.params.filterPlaceholder")}
                />
                {isFiltering && filteredCategories.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("graphs.params.noMatches")}</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {filteredCategories.map((category) => (
                      <Collapsible
                        key={category.key}
                        open={isFiltering || openCategories.has(category.key)}
                        onOpenChange={(open) => toggleCategoryOpen(category.key, open)}
                      >
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full justify-between">
                            {t(`graphs.categories.${category.key}`)}
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="flex flex-col gap-1 py-1 pl-3">
                          {category.params.map((param) => {
                            const isSelected = selectedKeys.includes(param.key);
                            const doc = getParamDoc(param.key);
                            const button = (
                              <Button
                                type="button"
                                variant={isSelected ? "secondary" : "ghost"}
                                size="sm"
                                className="justify-start"
                                onClick={() => toggleParam(param.key)}
                              >
                                {param.label}
                              </Button>
                            );
                            if (!doc) return <span key={param.key}>{button}</span>;
                            return (
                              <HoverCard key={param.key}>
                                <HoverCardTrigger asChild>{button}</HoverCardTrigger>
                                <HoverCardContent>
                                  <p className="font-medium">{param.label}</p>
                                  <p className="mt-1 text-muted-foreground">{doc.text}</p>
                                  {doc.url && (
                                    <a
                                      href={doc.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-2 inline-block text-primary underline-offset-4 hover:underline"
                                    >
                                      {t("graphs.params.readMore")}
                                    </a>
                                  )}
                                </HoverCardContent>
                              </HoverCard>
                            );
                          })}
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <TimelineChart series={series} modeSegments={rawLog.modeSegments} timeRangeMs={rawLog.timeRangeMs} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
