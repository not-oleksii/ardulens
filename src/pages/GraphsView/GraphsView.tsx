import { ChevronDown, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { FindingsBadge } from "../../components/FindingsBadge/FindingsBadge";
import { TimelineChart } from "../../components/TimelineChart/TimelineChart";
import type { TimelineSeriesInput } from "../../components/TimelineChart/types";
import { useDerivedFromFile } from "../../hooks/useDerivedFromFile/useDerivedFromFile";
import { getCoreWorker } from "../../services/coreWorkerClient/coreWorkerClient";
import { useFileStore } from "../../stores/fileStore/fileStore";
import { useUiStore } from "../../stores/uiStore/uiStore";
import { isParsedFlights } from "../../types";

interface Derived {
  result: RawLogResult;
  findings: Finding[];
}

const SERIES_COLORS = ["#3b82f6", "#f97316", "#22c55e", "#ef4444", "#a855f7", "#06b6d4", "#eab308", "#ec4899"];

export function GraphsView() {
  const { t } = useTranslation();
  const file = useFileStore((s) => s.file);
  const pendingPresetKey = useUiStore((s) => s.pendingPresetKey);
  const setPendingPresetKey = useUiStore((s) => s.setPendingPresetKey);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [paramFilter, setParamFilter] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  const { data: loaded, isLoading } = useDerivedFromFile<Derived>(file, async (name, buf) => {
    const worker = getCoreWorker();
    try {
      // Two independent parses of the same buffer: buildRawLog() for the chart/param
      // tree, parseFile() for the per-flight Sample model the advisors already know how
      // to check. A bit of duplicated work for .bin files, but keeps the advisors on the
      // same simple Flight model the Logs page uses instead of a second detection path.
      const [result, parseResult] = await Promise.all([worker.buildRawLog(name, buf), worker.parseFile(name, buf)]);
      const findings = isParsedFlights(parseResult) ? parseResult.flights.flatMap((f) => runAdvisors(f)) : [];
      return { result, findings };
    } catch (err) {
      return {
        result: { error: t("logs.messages.parseError", { message: err instanceof Error ? err.message : String(err) }) },
        findings: [],
      };
    }
  });

  // Reset the per-file UI selections whenever a different file is loaded, using the
  // "adjust state during render" pattern (see React docs) instead of an effect.
  const [resetKeyFile, setResetKeyFile] = useState(file);
  if (file !== resetKeyFile) {
    setResetKeyFile(file);
    setSelectedKeys([]);
    setParamFilter("");
    setOpenCategories(new Set());
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

  // Consumes a preset deep-linked in from elsewhere (currently PID Tune's per-axis "View in
  // Graphs" button, see PidTuneSection.tsx) - a one-shot hand-off via uiStore. The local
  // selectedKeys update happens right here, during render, the same safe "adjust state during
  // render" way as resetKeyFile above; but clearing the external uiStore field is deferred to
  // the effect below - calling a Zustand setter (which synchronously notifies every subscriber,
  // including this same component) synchronously during render triggers React's "Cannot update
  // a component while rendering a different component" warning, since it's a genuinely
  // different update source than this component's own useState setters.
  const [consumedPresetKey, setConsumedPresetKey] = useState<string | null>(null);
  if (pendingPresetKey && pendingPresetKey !== consumedPresetKey && rawLog) {
    setConsumedPresetKey(pendingPresetKey);
    const preset = PRESETS.find((p) => p.key === pendingPresetKey);
    const keys = preset ? resolvePreset(preset, rawLog.series) : null;
    if (keys) applyPreset(keys);
  }
  useEffect(() => {
    if (consumedPresetKey) setPendingPresetKey(null);
  }, [consumedPresetKey, setPendingPresetKey]);

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

  // Real bug fix: the parameter tree/filter already show each param's friendly `label` (e.g.
  // "Desired Roll Rate"), but the series list and chart legend were falling back to the raw
  // series `key` (e.g. "RATE.RDes") instead - built once per rawLog rather than re-scanning
  // categories per series.
  const paramLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    if (rawLog) for (const category of rawLog.categories) for (const p of category.params) map.set(p.key, p.label);
    return map;
  }, [rawLog]);

  const series: TimelineSeriesInput[] = useMemo(() => {
    if (!rawLog) return [];
    return selectedKeys
      .filter((key) => rawLog.series[key])
      .map((key, i) => ({
        key,
        label: paramLabelByKey.get(key) ?? key,
        color: SERIES_COLORS[i % SERIES_COLORS.length]!,
        data: rawLog.series[key]!,
      }));
  }, [rawLog, selectedKeys, paramLabelByKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("graphs.heading")}</CardTitle>
        <CardDescription>{t("graphs.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading && <p className="text-sm text-muted-foreground">{t("graphs.drop.parsing")}</p>}

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
                <div className="relative">
                  <Input
                    value={paramFilter}
                    onChange={(e) => setParamFilter(e.target.value)}
                    placeholder={t("graphs.params.filterPlaceholder")}
                    aria-label={t("graphs.params.filterPlaceholder")}
                    className={paramFilter ? "pr-8" : undefined}
                  />
                  {paramFilter && (
                    <button
                      type="button"
                      aria-label={t("graphs.params.clearFilter")}
                      onClick={() => setParamFilter("")}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {isFiltering && filteredCategories.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("graphs.params.noMatches")}</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {filteredCategories.map((category) => (
                      <Collapsible
                        key={category.key}
                        open={isFiltering || openCategories.has(category.key)}
                        // While filtering, every category is forced open (see `open` above) -
                        // ignore clicks on the trigger here rather than silently recording them
                        // into `openCategories`, which would otherwise produce a jarring,
                        // seemingly-random re-collapse of categories the user never
                        // consciously toggled once the filter is cleared.
                        onOpenChange={(open) => {
                          if (isFiltering) return;
                          toggleCategoryOpen(category.key, open);
                        }}
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
