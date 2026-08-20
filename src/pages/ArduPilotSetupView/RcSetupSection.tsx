import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COPTER_MODE_NAMES, PLANE_MODE_NAMES } from "../../constants";
import type { MavParamType, MavType } from "../../mavlink/registry/registry";
import { fetchParamDocs, vehicleFolderForMavType, type ParamDocsMap } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { ModifiedFromDefaultDot } from "./ModifiedFromDefaultDot";
import { ParamLoadProgress } from "./ParamLoadProgress";
import { FLTMODE_BAND_RANGE_LABELS, FLTMODE_BAND_UPPER_BOUNDS, fltModeBandIndex } from "./rcBands";
import { colorForRcChannel } from "./rcChannelColors";
import {
  FAILSAFE_PARAM_NAMES,
  FLIGHT_MODE_SLOT_NAMES,
  RC_OPTION_CHANNEL_COUNT,
  RC_SETUP_PARAM_NAMES,
  RCMAP_AXIS_LABELS,
  RCMAP_PARAM_NAMES,
  type AssignableFunction,
} from "./rcSetupParams";

interface RcSetupSectionProps {
  vehicleType: MavType;
  live: Record<number, number>;
  onLoad: () => void;
  onSetParam: (name: string, value: number, type: MavParamType) => void;
}

// 900-2100us comfortably covers real RC PWM including typical overshoot past 1000-2000 -
// same reference scale RcCalSection's live bars use, so a channel looks the same in both places.
const SCALE_MIN = 900;
const SCALE_MAX = 2100;
function scalePct(value: number): number {
  return Math.min(100, Math.max(0, ((value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));
}

// Round-number gridlines on every live PWM bar (Betaflight-style rulers) - purely visual, not
// meaningful boundaries the way the flight-mode band edges below are.
const TICK_PWM_VALUES = [1000, 1200, 1400, 1600, 1800, 2000];

// The real 6-band edges (900 and 2100 close off the first/last band) - used to size each flight-
// mode band's segment of the wide overview bar proportionally to its actual PWM width, rather
// than 6 equal-width boxes that would misrepresent how much smaller "1231-1360" is than "≥1751".
const FLTMODE_BAND_EDGES = [SCALE_MIN, ...FLTMODE_BAND_UPPER_BOUNDS, SCALE_MAX];

export function RcSetupSection({ vehicleType, live, onLoad, onSetParam }: RcSetupSectionProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const [docs, setDocs] = useState<ParamDocsMap | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [pendingChanges, setPendingChanges] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Assignment flow: pick a function on the left, then click the channel bar it should apply
  // to on the right (see rcSetupParams.ts's AssignableFunction).
  const [selectedFunction, setSelectedFunction] = useState<AssignableFunction | null>(null);
  const [functionFilter, setFunctionFilter] = useState("");
  const [customCodeInput, setCustomCodeInput] = useState("");

  const vehicleFolder = vehicleFolderForMavType(vehicleType);
  const modeNamesFallback = vehicleFolder === "ArduCopter" ? COPTER_MODE_NAMES : vehicleFolder === "ArduPlane" ? PLANE_MODE_NAMES : null;

  useEffect(() => {
    let cancelled = false;
    fetchParamDocs(vehicleFolder)
      .then((result) => {
        if (!cancelled) setDocs(result);
      })
      .catch(() => {
        // Enum labels are a nice-to-have - the raw numeric codes still work without them.
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleFolder]);

  function stageChange(name: string, value: number) {
    const original = params[name]?.value;
    setPendingChanges((prev) => {
      const next = { ...prev };
      if (original !== undefined && value === original) {
        delete next[name];
      } else {
        next[name] = value;
      }
      return next;
    });
  }

  function handleResetAll() {
    setPendingChanges({});
  }

  function handleConfirmSaveAll() {
    for (const [name, value] of Object.entries(pendingChanges)) {
      const type = params[name]?.type;
      if (type !== undefined) onSetParam(name, value, type);
    }
    setPendingChanges({});
    setConfirmOpen(false);
  }

  const hasAnyLoaded = RC_SETUP_PARAM_NAMES.some((name) => params[name] !== undefined);
  const pendingEntries = Object.entries(pendingChanges);
  const hasPendingChanges = pendingEntries.length > 0;

  const fltModeChEntry = params.FLTMODE_CH;
  const fltModeChannel = fltModeChEntry ? (pendingChanges.FLTMODE_CH ?? fltModeChEntry.value) : null;
  const fltModeLivePwm = fltModeChannel !== null ? live[fltModeChannel] : undefined;
  const activeBandIndex = fltModeLivePwm !== undefined ? fltModeBandIndex(fltModeLivePwm) : null;

  function shownValue(name: string): number | undefined {
    return pendingChanges[name] ?? params[name]?.value;
  }

  // The resolved mode name for one FLTMODE slot, for the overview bar's segment labels - same
  // value/label lookup modeSelect's own <select> uses, just as plain text instead of a control
  // (some bands are too narrow, e.g. "1231-1360", to fit a dropdown at their real proportional
  // width).
  function modeLabelFor(name: string): string | null {
    const entry = params[name];
    if (!entry) return null;
    const value = shownValue(name)!;
    const values = docs?.[name]?.values ?? docs?.FLTMODE1?.values ?? modeNamesFallback ?? undefined;
    return values?.[value] ?? String(value);
  }

  function modeSelect(name: string, ownValues: Record<number, string> | undefined) {
    const entry = params[name];
    if (!entry) return <span className="font-mono text-xs text-muted-foreground">-</span>;
    const value = shownValue(name)!;
    const values = ownValues ?? modeNamesFallback ?? undefined;
    if (values) {
      return (
        <span className="flex items-center gap-1.5">
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={value}
            onChange={(e) => stageChange(name, Number(e.target.value))}
          >
            {Object.entries(values).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <ModifiedFromDefaultDot name={name} value={value} />
        </span>
      );
    }
    return editingName === name ? (
      <Input
        autoFocus
        value={editingValue}
        onChange={(e) => setEditingValue(e.target.value)}
        onBlur={() => commitEdit(name)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitEdit(name);
          if (e.key === "Escape") setEditingName(null);
        }}
        className="h-7 w-24"
      />
    ) : (
      <span className="flex items-center gap-1.5">
        <button type="button" className="font-mono text-xs hover:underline" onClick={() => startEdit(name, value)}>
          {value}
        </button>
        <ModifiedFromDefaultDot name={name} value={value} />
      </span>
    );
  }

  function startEdit(name: string, currentValue: number) {
    setEditingName(name);
    setEditingValue(String(currentValue));
  }

  function commitEdit(name: string) {
    setEditingName(null);
    const parsed = Number(editingValue);
    if (!Number.isFinite(parsed)) return;
    stageChange(name, parsed);
  }

  function editableField(name: string, enumValues?: Record<number, string>) {
    const entry = params[name];
    if (!entry) return <span className="font-mono text-xs text-muted-foreground">-</span>;
    const value = shownValue(name)!;
    if (enumValues) {
      return (
        <span className="flex items-center gap-1.5">
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={value}
            onChange={(e) => stageChange(name, Number(e.target.value))}
          >
            {Object.entries(enumValues).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <ModifiedFromDefaultDot name={name} value={value} />
        </span>
      );
    }
    return editingName === name ? (
      <Input
        autoFocus
        value={editingValue}
        onChange={(e) => setEditingValue(e.target.value)}
        onBlur={() => commitEdit(name)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitEdit(name);
          if (e.key === "Escape") setEditingName(null);
        }}
        className="h-7 w-24"
      />
    ) : (
      <span className="flex items-center gap-1.5">
        <button type="button" className="font-mono text-xs hover:underline" onClick={() => startEdit(name, value)}>
          {value}
        </button>
        <ModifiedFromDefaultDot name={name} value={value} />
      </span>
    );
  }

  // The RCx_OPTION aux-function enum is identical across every channel - RC1_OPTION's own
  // real code->label list (fetched from ArduPilot's own docs) is the canonical source for the
  // assignable-function list, rather than re-fetching or hardcoding it per channel.
  const optionValues = docs?.RC1_OPTION?.values;
  const filteredOptions = optionValues
    ? Object.entries(optionValues).filter(([, label]) => label.toLowerCase().includes(functionFilter.toLowerCase()))
    : [];

  function isSelected(candidate: AssignableFunction): boolean {
    if (!selectedFunction) return false;
    if (candidate.kind !== selectedFunction.kind) return false;
    if (candidate.kind === "rcmap" && selectedFunction.kind === "rcmap") return candidate.param === selectedFunction.param;
    if (candidate.kind === "option" && selectedFunction.kind === "option") return candidate.code === selectedFunction.code;
    return candidate.kind === "fltmodeChannel";
  }

  function assignmentLabelsFor(channel: number): string[] {
    const labels: string[] = [];
    if (fltModeChannel === channel) labels.push(t("ardupilotSetup.rcSetup.fltmodeChannelShort"));
    for (const rcmapName of RCMAP_PARAM_NAMES) {
      if (shownValue(rcmapName) === channel) labels.push(RCMAP_AXIS_LABELS[rcmapName]);
    }
    const optName = `RC${channel}_OPTION`;
    const optValue = shownValue(optName);
    if (optValue !== undefined && optValue !== 0) {
      labels.push(docs?.[optName]?.values?.[optValue] ?? String(optValue));
    }
    return labels;
  }

  function assignToChannel(channel: number) {
    if (!selectedFunction) return;
    if (selectedFunction.kind === "fltmodeChannel") {
      stageChange("FLTMODE_CH", channel);
    } else if (selectedFunction.kind === "rcmap") {
      stageChange(selectedFunction.param, channel);
    } else {
      stageChange(`RC${channel}_OPTION`, selectedFunction.code);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.rcSetup.heading")}</h3>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onLoad}>
            {t("ardupilotSetup.rcSetup.load")}
          </Button>
          {hasPendingChanges && (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={handleResetAll}>
                {t("ardupilotSetup.rcSetup.reset")}
              </Button>
              <Button type="button" size="sm" onClick={() => setConfirmOpen(true)}>
                {t("ardupilotSetup.rcSetup.saveAll", { count: pendingEntries.length })}
              </Button>
            </>
          )}
        </div>
      </div>

      <ParamLoadProgress />

      {!hasAnyLoaded ? (
        <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.rcSetup.notLoaded")}</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.rcSetup.assignIntro")}</p>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(200px,280px)_1fr]">
            <section className="flex min-h-0 flex-col gap-2 rounded-lg border border-border p-2">
              <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
                {t("ardupilotSetup.rcSetup.functionsHeading")}
              </h4>
              <Input
                value={functionFilter}
                onChange={(e) => setFunctionFilter(e.target.value)}
                placeholder={t("ardupilotSetup.rcSetup.functionSearch")}
                className="h-7 text-xs"
              />
              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setSelectedFunction({ kind: "fltmodeChannel" })}
                  className={`rounded-md px-2 py-1 text-left text-xs ${isSelected({ kind: "fltmodeChannel" }) ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                >
                  {t("ardupilotSetup.rcSetup.fltmodeChannelLong")}
                </button>
                {RCMAP_PARAM_NAMES.map((param) => {
                  const candidate: AssignableFunction = { kind: "rcmap", param, axisLabel: RCMAP_AXIS_LABELS[param] };
                  return (
                    <button
                      key={param}
                      type="button"
                      onClick={() => setSelectedFunction(candidate)}
                      className={`rounded-md px-2 py-1 text-left text-xs ${isSelected(candidate) ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                    >
                      {t("ardupilotSetup.rcSetup.rcmapLabel", { axis: RCMAP_AXIS_LABELS[param] })}
                    </button>
                  );
                })}
                <div className="my-1 border-t border-border" />
                {optionValues ? (
                  filteredOptions.map(([code, label]) => {
                    const candidate: AssignableFunction = { kind: "option", code: Number(code), label };
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setSelectedFunction(candidate)}
                        className={`rounded-md px-2 py-1 text-left text-xs ${isSelected(candidate) ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                      >
                        {label}
                      </button>
                    );
                  })
                ) : (
                  <p className="px-2 py-1 text-xs text-muted-foreground">{t("ardupilotSetup.rcSetup.optionsUnavailable")}</p>
                )}
              </div>
              {/* Docs-driven labels are a nice-to-have - offline (or a fetch that just failed)
                  shouldn't block assigning a function whose numeric code you already know. */}
              <div className="flex items-center gap-1 border-t border-border pt-1.5">
                <Input
                  value={customCodeInput}
                  onChange={(e) => setCustomCodeInput(e.target.value)}
                  placeholder={t("ardupilotSetup.rcSetup.customCodePlaceholder")}
                  className="h-7 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const code = Number(customCodeInput);
                    if (!Number.isFinite(code)) return;
                    setSelectedFunction({ kind: "option", code, label: optionValues?.[code] ?? `#${code}` });
                  }}
                >
                  {t("ardupilotSetup.rcSetup.customCodeUse")}
                </Button>
              </div>
            </section>

            <section className="flex min-h-0 flex-col gap-2">
              <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
                {t("ardupilotSetup.rcSetup.channelsHeading")}
              </h4>
              <p className="text-xs text-muted-foreground">
                {selectedFunction ? t("ardupilotSetup.rcSetup.clickToAssign") : t("ardupilotSetup.rcSetup.selectFunctionFirst")}
              </p>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                {Array.from({ length: RC_OPTION_CHANNEL_COUNT }, (_, i) => i + 1).map((channel) => {
                  const color = colorForRcChannel(channel);
                  const pwm = live[channel];
                  const labels = assignmentLabelsFor(channel);
                  return (
                    <button
                      key={channel}
                      type="button"
                      disabled={!selectedFunction}
                      onClick={() => assignToChannel(channel)}
                      aria-label={t("ardupilotSetup.rcSetup.channelButtonLabel", { channel })}
                      className="flex items-center gap-3 rounded-lg border border-border p-2 text-left text-xs enabled:hover:border-primary disabled:opacity-70"
                    >
                      <span className="flex w-7 shrink-0 flex-col items-center gap-0.5 font-mono font-semibold" style={{ color }}>
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                        {channel}
                      </span>
                      {/* A wide ruled bar (tick marks at round PWM values) with a bold needle for
                          the live position - Betaflight's own receiver-tab look, in place of the
                          previous thin bar + barely-visible dot. */}
                      <div className="relative h-5 min-w-0 flex-[2] overflow-hidden rounded-md bg-muted">
                        {TICK_PWM_VALUES.map((tick) => (
                          <div key={tick} className="absolute inset-y-0 w-px bg-border/70" style={{ left: `${scalePct(tick)}%` }} />
                        ))}
                        {pwm !== undefined && (
                          <div
                            className="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full shadow-sm"
                            style={{ left: `${scalePct(pwm)}%`, background: color }}
                          />
                        )}
                      </div>
                      <span className="w-14 shrink-0 font-mono text-muted-foreground">{pwm !== undefined ? `${pwm} us` : "-"}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{labels.join(", ") || "-"}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <section className="flex flex-col gap-2">
            <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">{t("ardupilotSetup.rcSetup.flightModesHeading")}</h4>

            {/* A wide overview bar sized to the 6 bands' REAL proportional PWM widths (e.g.
                "1231-1360" is genuinely narrower than "≥1751") with a live needle for the flight-
                mode channel's current position - these bands are real, fixed ArduPilot firmware
                boundaries (RC_Channel::read_6pos_switch), not an editable range like Betaflight's
                own mode sliders, so this is a live readout only; the list below is still where
                each band's assigned mode is actually changed. */}
            <div className="relative flex h-8 shrink-0 overflow-hidden rounded-md border border-border">
              {FLIGHT_MODE_SLOT_NAMES.map((name, i) => {
                const widthPct = scalePct(FLTMODE_BAND_EDGES[i + 1]!) - scalePct(FLTMODE_BAND_EDGES[i]!);
                const isActive = activeBandIndex === i;
                const label = modeLabelFor(name);
                return (
                  <div
                    key={name}
                    className={`flex items-center justify-center overflow-hidden border-r border-border/60 px-0.5 text-center text-[10px] font-semibold whitespace-nowrap last:border-r-0 ${isActive ? "bg-primary/25 text-primary" : "bg-muted/50 text-muted-foreground"}`}
                    style={{ width: `${widthPct}%` }}
                    title={label ?? undefined}
                  >
                    <span className="truncate">{label ?? "-"}</span>
                  </div>
                );
              })}
              {fltModeLivePwm !== undefined && (
                <div
                  className="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-foreground shadow-sm"
                  style={{ left: `${scalePct(fltModeLivePwm)}%` }}
                />
              )}
            </div>

            <div className="flex flex-col gap-1 rounded-lg border border-border p-2">
              {FLIGHT_MODE_SLOT_NAMES.map((name, i) => {
                const isActive = activeBandIndex === i;
                return (
                  <div
                    key={name}
                    className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs ${isActive ? "bg-primary/15" : ""}`}
                  >
                    <span className="font-mono text-muted-foreground">{FLTMODE_BAND_RANGE_LABELS[i]} us</span>
                    {modeSelect(name, docs?.[name]?.values ?? docs?.FLTMODE1?.values)}
                    {isActive && <span className="text-primary">{t("ardupilotSetup.rcSetup.active")}</span>}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">{t("ardupilotSetup.rcSetup.failsafeHeading")}</h4>
            <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
              {FAILSAFE_PARAM_NAMES.map((name) => (
                <div key={name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono">{name}</span>
                  {editableField(name, name === "FS_THR_ENABLE" ? docs?.FS_THR_ENABLE?.values : undefined)}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.rcSetup.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("ardupilotSetup.rcSetup.confirmDescription", { count: pendingEntries.length })}</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ardupilotSetup.parameters.name")}</TableHead>
                  <TableHead>{t("ardupilotSetup.rcSetup.from")}</TableHead>
                  <TableHead>{t("ardupilotSetup.rcSetup.to")}</TableHead>
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
              {t("ardupilotSetup.rcSetup.cancel")}
            </Button>
            <Button type="button" onClick={handleConfirmSaveAll}>
              {t("ardupilotSetup.rcSetup.confirmSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
