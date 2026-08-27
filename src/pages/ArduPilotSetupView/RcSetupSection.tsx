import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COPTER_MODE_NAMES, PLANE_MODE_NAMES } from "../../constants";
import type { MavParamType, MavType } from "../../mavlink/registry/registry";
import { vehicleFolderForMavType } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { AUX_FUNCTION_NAMES_COPTER, AUX_FUNCTION_NAMES_PLANE } from "./auxFunctionNames";
import { ModifiedFromDefaultDot } from "./ModifiedFromDefaultDot";
import { ParamLoadProgress } from "./ParamLoadProgress";
import { FLTMODE_BAND_RANGE_LABELS, FLTMODE_BAND_UPPER_BOUNDS, fltModeBandIndex } from "./rcBands";
import { colorForRcChannel } from "./rcChannelColors";
import {
  failsafeParamNamesFor,
  FLIGHT_MODE_SLOT_NAMES,
  RC_OPTION_CHANNEL_COUNT,
  RC_SETUP_PARAM_NAMES,
  RCMAP_AXIS_LABELS,
  RCMAP_PARAM_NAMES,
} from "./rcSetupParams";
import { useParamDocs } from "./useParamDocs";
import { useStagedParamChanges } from "./useStagedParamChanges";

const CUSTOM_CODE_VALUE = "custom";
const NONE_VALUE = "none";
const FLTMODE_VALUE = "fltmode";
function rcmapValue(param: (typeof RCMAP_PARAM_NAMES)[number]): string {
  return `rcmap:${param}`;
}
function optionValue(code: number | string): string {
  return `option:${code}`;
}

interface FunctionOption {
  value: string;
  label: string;
}

/** Pure so ChannelFunctionSelect's own useMemo can skip rebuilding this on every render - the
 *  aux-function list is ~140 entries, so with 16 channels' selects this is real DOM/diff weight,
 *  and RcSetupSection re-renders at the live RC_CHANNELS telemetry rate (10Hz) while this tab is
 *  open (see ArduPilotSetupView.tsx's rcCalLive). */
function buildFunctionOptions(current: string, base: readonly FunctionOption[], customCodeLabel: string): FunctionOption[] {
  if (current.startsWith("option:") && !base.some((item) => item.value === current)) {
    return [...base, { value: current, label: `#${current.slice(7)}` }, { value: CUSTOM_CODE_VALUE, label: customCodeLabel }];
  }
  return [...base, { value: CUSTOM_CODE_VALUE, label: customCodeLabel }];
}

interface ChannelFunctionSelectProps {
  channel: number;
  current: string;
  baseFunctionOptions: readonly FunctionOption[];
  customCodeLabel: string;
  ariaLabel: string;
  onChange: (channel: number, raw: string) => void;
}

// Memoized so a live PWM tick elsewhere in the row (channel/pwm text, needle position) doesn't
// force React to re-diff this select's ~140 <option> children - see buildFunctionOptions above.
// Every prop here is either a primitive or a reference RcSetupSection keeps stable across pure
// PWM-tick re-renders (baseFunctionOptions via useMemo, onChange via useCallback), so memo
// actually bails out on those ticks instead of comparing objects that "happen" to be equal.
const ChannelFunctionSelect = memo(function ChannelFunctionSelect({
  channel,
  current,
  baseFunctionOptions,
  customCodeLabel,
  ariaLabel,
  onChange,
}: ChannelFunctionSelectProps) {
  const options = useMemo(
    () => buildFunctionOptions(current, baseFunctionOptions, customCodeLabel),
    [current, baseFunctionOptions, customCodeLabel],
  );
  return (
    <select
      aria-label={ariaLabel}
      value={current}
      onChange={(e) => onChange(channel, e.target.value)}
      className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
    >
      {options.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
});

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

// Round-number gridlines on every live PWM bar - purely visual, not meaningful boundaries the
// way the flight-mode band edges below are.
const TICK_PWM_VALUES = [1000, 1200, 1400, 1600, 1800, 2000];

// The real 6-band edges (900 and 2100 close off the first/last band) - used to size each flight-
// mode band's segment of the wide overview bar proportionally to its actual PWM width, rather
// than 6 equal-width boxes that would misrepresent how much smaller "1231-1360" is than "≥1751".
const FLTMODE_BAND_EDGES = [SCALE_MIN, ...FLTMODE_BAND_UPPER_BOUNDS, SCALE_MAX];

export function RcSetupSection({ vehicleType, live, onLoad, onSetParam }: RcSetupSectionProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  // A channel picking "Custom code..." from its function <select> drops into this inline
  // numeric-entry mode instead (see buildFunctionOptions) - used both as the fallback when the
  // docs-driven RCx_OPTION enum hasn't loaded, and to reach a real firmware option code the
  // fetched docs don't happen to list.
  const [customCodeChannel, setCustomCodeChannel] = useState<number | null>(null);
  const [customCodeValue, setCustomCodeValue] = useState("");

  const vehicleFolder = vehicleFolderForMavType(vehicleType);
  const modeNamesFallback = vehicleFolder === "ArduCopter" ? COPTER_MODE_NAMES : vehicleFolder === "ArduPlane" ? PLANE_MODE_NAMES : null;
  const failsafeParamNames = failsafeParamNamesFor(vehicleFolder);
  // Enum labels are a nice-to-have - the raw numeric codes still work without them.
  const { docs } = useParamDocs(vehicleFolder);
  // stageChange stays referentially stable across the pure PWM-tick re-renders RcSetupSection
  // gets at 10Hz while this tab is open - handleChannelFunctionChange below depends on it, and
  // needs to stay stable itself for ChannelFunctionSelect's memo to work.
  const {
    pendingChanges,
    pendingEntries,
    hasPendingChanges,
    confirmOpen,
    setConfirmOpen,
    stageChange,
    resetAll: handleResetAll,
    confirmSaveAll: handleConfirmSaveAll,
  } = useStagedParamChanges({ params, onSetParam });

  const hasAnyLoaded = RC_SETUP_PARAM_NAMES.some((name) => params[name] !== undefined);

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

  // Collapses adjacent FLTMODE slots that resolve to the same mode label into one wider overview-
  // bar segment - a switch with fewer physical positions than 6 typically has several of its bands
  // assigned the same mode (or left unconfigured), and showing 6 near-identical segments in that
  // case obscures how many modes are actually reachable rather than clarifying it.
  const notSelectedLabel = t("ardupilotSetup.rcSetup.notSelected");
  const mergedFlightModeBands = FLIGHT_MODE_SLOT_NAMES.reduce<{ startIndex: number; endIndex: number; label: string }[]>(
    (bands, name, i) => {
      const label = modeLabelFor(name) ?? notSelectedLabel;
      const last = bands[bands.length - 1];
      if (last && last.label === label) {
        last.endIndex = i;
      } else {
        bands.push({ startIndex: i, endIndex: i, label });
      }
      return bands;
    },
    [],
  );

  function modeSelect(name: string, ownValues: Record<number, string> | undefined) {
    const entry = params[name];
    if (!entry) return <span className="font-mono text-xs text-muted-foreground">{t("ardupilotSetup.rcSetup.notSelected")}</span>;
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

  // Bitmask params (e.g. FS_OPTIONS) don't fit editableField's single-value select/input - each
  // documented bit gets its own checkbox, and the staged value is the OR/AND of the current value
  // with that bit's mask, same stageChange path every other field here uses.
  function bitmaskField(name: string, bits: Record<number, string>) {
    const entry = params[name];
    if (!entry) return <span className="font-mono text-xs text-muted-foreground">-</span>;
    const value = shownValue(name)!;
    return (
      <div className="flex flex-col gap-1">
        {Object.entries(bits).map(([bit, label]) => {
          const bitValue = 1 << Number(bit);
          const checked = (value & bitValue) !== 0;
          return (
            <label key={bit} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => stageChange(name, value ^ bitValue)}
              />
              {label}
            </label>
          );
        })}
        <ModifiedFromDefaultDot name={name} value={value} />
      </div>
    );
  }

  // The RCx_OPTION aux-function enum is identical across every channel - RC1_OPTION's own
  // real code->label list (fetched from ArduPilot's own docs) is the canonical source for the
  // assignable-function list, rather than re-fetching or hardcoding it per channel. Falls back to
  // a bundled snapshot (see auxFunctionNames.ts) when the live docs fetch hasn't landed yet - most
  // often because there's no internet access out where the vehicle actually is - so previously-set
  // functions still show their real name instead of a bare code.
  const auxFunctionNamesFallback =
    vehicleFolder === "ArduCopter" ? AUX_FUNCTION_NAMES_COPTER : vehicleFolder === "ArduPlane" ? AUX_FUNCTION_NAMES_PLANE : null;
  const optionValues = docs?.RC1_OPTION?.values ?? auxFunctionNamesFallback ?? undefined;

  // The base <option> list every channel's function <select> shares - a channel-specific
  // "current value not in this list" entry (an undocumented/newer-firmware option code) and the
  // "Custom code..." escape hatch are appended per-channel by ChannelFunctionSelect/buildFunctionOptions.
  const baseFunctionOptions = useMemo(() => {
    const items: { value: string; label: string }[] = [
      { value: NONE_VALUE, label: t("ardupilotSetup.rcSetup.notSelected") },
      { value: FLTMODE_VALUE, label: t("ardupilotSetup.rcSetup.fltmodeChannelLong") },
      ...RCMAP_PARAM_NAMES.map((param) => ({
        value: rcmapValue(param),
        label: t("ardupilotSetup.rcSetup.rcmapLabel", { axis: RCMAP_AXIS_LABELS[param] }),
      })),
    ];
    if (optionValues) {
      // Alphabetical, not raw parameter-code order - with 150+ aux functions, scanning for one
      // by name is far easier than by whatever code ArduPilot happened to assign it.
      const auxItems = Object.entries(optionValues)
        .filter(([code]) => code !== "0") // code 0 ("Do Nothing") is exactly the NONE_VALUE state above
        .map(([code, label]) => ({ value: optionValue(code), label }))
        .sort((a, b) => a.label.localeCompare(b.label));
      items.push(...auxItems);
    }
    return items;
  }, [optionValues, t]);
  const customCodeLabel = t("ardupilotSetup.rcSetup.customCodeOption");

  /** Which function (if any) a channel currently holds, as one of buildFunctionOptions's values. */
  function currentFunctionValue(channel: number): string {
    if (fltModeChannel === channel) return FLTMODE_VALUE;
    for (const param of RCMAP_PARAM_NAMES) {
      if (shownValue(param) === channel) return rcmapValue(param);
    }
    const optValue = shownValue(`RC${channel}_OPTION`);
    if (optValue !== undefined && optValue !== 0) return optionValue(optValue);
    return NONE_VALUE;
  }

  // useCallback so this stays referentially stable across pure PWM-tick re-renders - it's passed
  // as a prop to every channel's memoized ChannelFunctionSelect (see that component's own comment
  // for why). Reads pendingChanges/params directly (not via the shownValue helper above) so its
  // dependency array can name them explicitly instead of depending on shownValue's own identity,
  // which is rebuilt every render and would defeat the memoization entirely.
  const handleChannelFunctionChange = useCallback(
    (channel: number, raw: string) => {
      const optName = `RC${channel}_OPTION`;
      const readValue = (name: string) => pendingChanges[name] ?? params[name]?.value;

      if (raw === CUSTOM_CODE_VALUE) {
        const current = readValue(optName);
        setCustomCodeChannel(channel);
        setCustomCodeValue(current !== undefined && current !== 0 ? String(current) : "");
        return;
      }

      const currentOpt = readValue(optName);
      const clearOption = () => {
        if (currentOpt !== undefined && currentOpt !== 0) stageChange(optName, 0);
      };
      const clearFltmodeIfHeld = () => {
        if (fltModeChannel === channel) stageChange("FLTMODE_CH", 0);
      };

      if (raw === FLTMODE_VALUE) {
        clearOption();
        stageChange("FLTMODE_CH", channel);
      } else if (raw.startsWith("rcmap:")) {
        clearOption();
        clearFltmodeIfHeld();
        stageChange(raw.slice("rcmap:".length), channel);
      } else if (raw.startsWith("option:")) {
        clearFltmodeIfHeld();
        stageChange(optName, Number(raw.slice("option:".length)));
      } else {
        clearOption();
        clearFltmodeIfHeld();
      }
    },
    [pendingChanges, params, fltModeChannel, stageChange],
  );

  function commitCustomCode(channel: number) {
    setCustomCodeChannel(null);
    const parsed = Number(customCodeValue);
    if (!Number.isFinite(parsed)) return;
    handleChannelFunctionChange(channel, optionValue(parsed));
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
          <section className="flex flex-col gap-2">
            <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
              {t("ardupilotSetup.rcSetup.channelsHeading")}
            </h4>
            <p className="text-xs text-muted-foreground">{t("ardupilotSetup.rcSetup.assignIntro")}</p>
            <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
              {Array.from({ length: RC_OPTION_CHANNEL_COUNT }, (_, i) => i + 1).map((channel) => {
                const color = colorForRcChannel(channel);
                const pwm = live[channel];
                const current = currentFunctionValue(channel);
                const isEditingCode = customCodeChannel === channel;
                return (
                  <div key={channel} className="flex items-center gap-3 rounded-lg border border-border p-2 text-xs">
                    <span className="flex w-7 shrink-0 flex-col items-center gap-0.5 font-mono font-semibold" style={{ color }}>
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                      {channel}
                    </span>
                    {/* A wide ruled bar (tick marks at round PWM values) with a bold needle for
                        the live position, in place of the previous thin bar + barely-visible
                        dot. */}
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
                    {isEditingCode ? (
                      <Input
                        autoFocus
                        type="number"
                        value={customCodeValue}
                        onChange={(e) => setCustomCodeValue(e.target.value)}
                        onBlur={() => commitCustomCode(channel)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitCustomCode(channel);
                          if (e.key === "Escape") setCustomCodeChannel(null);
                        }}
                        placeholder={t("ardupilotSetup.rcSetup.customCodePlaceholder")}
                        className="h-7 min-w-0 flex-1 text-xs"
                      />
                    ) : (
                      <ChannelFunctionSelect
                        channel={channel}
                        current={current}
                        baseFunctionOptions={baseFunctionOptions}
                        customCodeLabel={customCodeLabel}
                        ariaLabel={t("ardupilotSetup.rcSetup.channelFunctionLabel", { channel })}
                        onChange={handleChannelFunctionChange}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">{t("ardupilotSetup.rcSetup.flightModesHeading")}</h4>

            {/* A wide overview bar sized to the 6 bands' REAL proportional PWM widths (e.g.
                "1231-1360" is genuinely narrower than "≥1751") with a live needle for the flight-
                mode channel's current position - these bands are real, fixed ArduPilot firmware
                boundaries (RC_Channel::read_6pos_switch), not an editable range, so this is a
                live readout only; the list below is still where each band's assigned mode is
                actually changed. Adjacent bands sharing the same assigned mode are merged into one
                segment, so e.g. a 3-position switch that only ever lands on 3 distinct modes shows
                3 segments here instead of always 6. */}
            <div className="relative flex h-8 shrink-0 overflow-hidden rounded-md border border-border">
              {mergedFlightModeBands.map((band) => {
                const widthPct = scalePct(FLTMODE_BAND_EDGES[band.endIndex + 1]!) - scalePct(FLTMODE_BAND_EDGES[band.startIndex]!);
                const isActive = activeBandIndex !== null && activeBandIndex >= band.startIndex && activeBandIndex <= band.endIndex;
                return (
                  <div
                    key={band.startIndex}
                    className={`flex items-center justify-center overflow-hidden border-r border-border/60 px-0.5 text-center text-[10px] font-semibold whitespace-nowrap last:border-r-0 ${isActive ? "bg-primary/25 text-primary" : "bg-muted/50 text-muted-foreground"}`}
                    style={{ width: `${widthPct}%` }}
                    title={band.label}
                  >
                    <span className="truncate">{band.label}</span>
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
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">{t("ardupilotSetup.rcSetup.failsafeHeading")}</h4>
            <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
              {failsafeParamNames.map((name) => {
                const bits = docs?.[name]?.bitmask;
                return (
                  <div
                    key={name}
                    className={bits ? "flex flex-col gap-1 text-xs" : "flex items-center justify-between gap-2 text-xs"}
                  >
                    <span className="font-mono">{name}</span>
                    {bits ? bitmaskField(name, bits) : editableField(name, docs?.[name]?.values)}
                  </div>
                );
              })}
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
