import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MavParamType, MavType } from "../../mavlink/registry/registry";
import { fetchParamDocs, vehicleFolderForMavType, type ParamDocsMap } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { ComingSoonSection } from "./ComingSoonSection";
import { ModifiedFromDefaultDot } from "./ModifiedFromDefaultDot";
import { ParamLoadProgress } from "./ParamLoadProgress";
import { RC_OPTION_CHANNEL_COUNT } from "./rcSetupParams";
import { colorForRcChannel } from "./rcChannelColors";
import { TUNE_PARAM_NAMES_COPTER, TUNE_RC_OPTION_CODE } from "./tuneParamNames";

interface LiveTuningSectionProps {
  vehicleType: MavType;
  live: Record<number, number>;
  onLoad: () => void;
  onSetParam: (name: string, value: number, type: MavParamType) => void;
}

// Same 900-2100us reference scale every other live PWM bar in this app uses (RcSetupSection,
// RcCalSection, ServoRelaySection) - a channel looks the same wherever it's shown.
const SCALE_MIN = 900;
const SCALE_MAX = 2100;
function scalePct(value: number): number {
  return Math.min(100, Math.max(0, ((value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));
}
const TICK_PWM_VALUES = [1000, 1200, 1400, 1600, 1800, 2000];

// ~12s of history at the app's established 10Hz RC_CHANNELS tick (see RC_CHANNELS_STREAM_RATE_HZ
// in ArduPilotSetupView.tsx) - long enough to see a recent knob sweep, short enough that the
// sparkline stays readable at a small size.
const HISTORY_LENGTH = 120;

/** ArduPilot's real CH6/transmitter-tuning mechanism (RC_Channel::AUX_FUNC's TUNE slot,
 *  RCx_OPTION=219 - confirmed against ArduCopter's own apm.pdef.xml, see tuneParamNames.ts):
 *  a chosen RC channel's PWM linearly maps to [TUNE_MIN, TUNE_MAX] and drives whichever gain
 *  TUNE names, letting a pilot dial in a value in flight without a laptop. This app has no
 *  MAVLink message that reports the live *resolved* value (PID_TUNING is axis-scoped and only
 *  covers a handful of TUNE's 37 entries) - the live value shown here is derived client-side,
 *  the same interpolation the firmware itself performs, from the assigned channel's live PWM
 *  (already streamed via RC_CHANNELS/rcCalLive) through its own RCx_MIN/RCx_MAX calibration.
 *
 *  Copter-only for now: Plane/QuadPlane's transmitter tuning is a structurally different scheme
 *  (its own TUNE_CHAN channel-selector param instead of RCx_OPTION, a separate TUNE_PARAM enum
 *  including QuadPlane VTOL gains, and TUNE_RANGE as a *multiplicative* factor around the start
 *  value rather than an additive TUNE_MIN/TUNE_MAX) - real enough to need its own UI, not a
 *  variant of this one. Rover/Sub/AntennaTracker have no transmitter-tuning feature in current
 *  firmware at all. */
export function LiveTuningSection({ vehicleType, live, onLoad, onSetParam }: LiveTuningSectionProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const [docs, setDocs] = useState<ParamDocsMap | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  // A ring buffer of recent derived values, advanced once per live RC_CHANNELS tick. Adjusted
  // directly during render (comparing against the `live` object seen on the previous render,
  // same pattern ArduPilotSetupSidebar.tsx uses for its own prop-driven state) rather than in a
  // useEffect - `live` is a fresh object reference every tick (see ArduPilotSetupView's
  // observeRcCal), so an effect keyed on it would call setState synchronously every render,
  // which react-hooks/set-state-in-effect (enforced in this codebase) flags outright.
  const [historyState, setHistoryState] = useState<{ live: Record<number, number>; values: number[] }>(() => ({ live, values: [] }));

  const vehicleFolder = vehicleFolderForMavType(vehicleType);

  useEffect(() => {
    if (vehicleFolder !== "ArduCopter") return;
    let cancelled = false;
    fetchParamDocs(vehicleFolder)
      .then((result) => {
        if (!cancelled) setDocs(result);
      })
      .catch(() => {
        // Enum labels are a nice-to-have - the bundled TUNE_PARAM_NAMES_COPTER fallback still works.
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleFolder]);

  // Which RC channel (if any) currently holds RCx_OPTION=219 - null if none does.
  const tuneChannel = Array.from({ length: RC_OPTION_CHANNEL_COUNT }, (_, i) => i + 1).find(
    (channel) => params[`RC${channel}_OPTION`]?.value === TUNE_RC_OPTION_CODE,
  );

  const tuneMinValue = params.TUNE_MIN?.value;
  const tuneMaxValue = params.TUNE_MAX?.value;
  const livePwm = tuneChannel !== undefined ? live[tuneChannel] : undefined;
  const rcMin = tuneChannel !== undefined ? (params[`RC${tuneChannel}_MIN`]?.value ?? SCALE_MIN) : undefined;
  const rcMax = tuneChannel !== undefined ? (params[`RC${tuneChannel}_MAX`]?.value ?? SCALE_MAX) : undefined;
  const derivedValue =
    livePwm !== undefined && rcMin !== undefined && rcMax !== undefined && tuneMinValue !== undefined && tuneMaxValue !== undefined && rcMax !== rcMin
      ? tuneMinValue + (Math.min(rcMax, Math.max(rcMin, livePwm)) - rcMin) * ((tuneMaxValue - tuneMinValue) / (rcMax - rcMin))
      : undefined;

  // Redrawn on every live RC_CHANNELS tick (`live` is a fresh object reference each time - see
  // ArduPilotSetupView's observeRcCal) - detected by comparing against the `live` reference seen
  // on the previous render, same "adjust state during render" shape as historyState's own
  // declaration comment above. Nothing is appended once no channel is assigned or the range
  // isn't known yet, so the sparkline stays empty rather than filling with meaningless zeros.
  if (historyState.live !== live) {
    const values = derivedValue !== undefined ? [...historyState.values.slice(-(HISTORY_LENGTH - 1)), derivedValue] : historyState.values;
    setHistoryState({ live, values });
  }

  if (vehicleFolder !== "ArduCopter") {
    return <ComingSoonSection heading={t("ardupilotSetup.liveTuning.heading")} description={t("ardupilotSetup.comingSoon.liveTuning")} />;
  }

  const hasAnyLoaded = params.TUNE !== undefined || params.TUNE_MIN !== undefined || params.TUNE_MAX !== undefined;

  function startEdit(name: string, currentValue: number) {
    setEditingName(name);
    setEditingValue(String(currentValue));
  }

  function commitEdit(name: string) {
    setEditingName(null);
    const parsed = Number(editingValue);
    if (!Number.isFinite(parsed)) return;
    const type = params[name]?.type;
    if (type !== undefined) onSetParam(name, parsed, type);
  }

  function handleTuneChange(raw: string) {
    const type = params.TUNE?.type;
    if (type !== undefined) onSetParam("TUNE", Number(raw), type);
  }

  function handleChannelChange(raw: string) {
    const newChannel = Number(raw); // 0 = "not assigned"
    if (tuneChannel !== undefined && tuneChannel !== newChannel) {
      const oldType = params[`RC${tuneChannel}_OPTION`]?.type;
      if (oldType !== undefined) onSetParam(`RC${tuneChannel}_OPTION`, 0, oldType);
    }
    if (newChannel !== 0) {
      const newType = params[`RC${newChannel}_OPTION`]?.type;
      if (newType !== undefined) onSetParam(`RC${newChannel}_OPTION`, TUNE_RC_OPTION_CODE, newType);
    }
    setHistoryState({ live, values: [] });
  }

  function numberField(name: string) {
    const entry = params[name];
    if (!entry) return <span className="font-mono text-xs text-muted-foreground">-</span>;
    const value = entry.value;
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
        className="h-7 w-28"
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

  const tuneValues = docs?.TUNE?.values ?? TUNE_PARAM_NAMES_COPTER;
  const tuneEntry = params.TUNE;
  const color = tuneChannel !== undefined ? colorForRcChannel(tuneChannel) : undefined;

  const history = historyState.values;
  const sparklinePoints = history
    .map((v, i) => {
      const x = history.length > 1 ? (i / (history.length - 1)) * 100 : 100;
      const range = tuneMaxValue !== undefined && tuneMinValue !== undefined ? tuneMaxValue - tuneMinValue : 0;
      const y = range !== 0 && tuneMinValue !== undefined ? 100 - ((v - tuneMinValue) / range) * 100 : 50;
      return `${x},${Math.min(100, Math.max(0, y))}`;
    })
    .join(" ");

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.liveTuning.heading")}</h3>
        <Button type="button" size="sm" variant="outline" onClick={onLoad}>
          {t("ardupilotSetup.liveTuning.load")}
        </Button>
      </div>
      <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.liveTuning.description")}</p>

      <ParamLoadProgress />

      {!hasAnyLoaded ? (
        <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.liveTuning.notLoaded")}</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">{t("ardupilotSetup.liveTuning.channelHeading")}</h4>
            <select
              aria-label={t("ardupilotSetup.liveTuning.channelHeading")}
              className="h-8 w-full max-w-56 rounded-md border border-border bg-background px-2 text-xs"
              value={tuneChannel ?? 0}
              onChange={(e) => handleChannelChange(e.target.value)}
            >
              <option value={0}>{t("ardupilotSetup.liveTuning.channelNone")}</option>
              {Array.from({ length: RC_OPTION_CHANNEL_COUNT }, (_, i) => i + 1).map((channel) => (
                <option key={channel} value={channel}>
                  {t("ardupilotSetup.liveTuning.channelOption", { channel })}
                </option>
              ))}
            </select>
          </section>

          <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">{t("ardupilotSetup.liveTuning.paramHeading")}</h4>
            {tuneEntry ? (
              <span className="flex items-center gap-1.5">
                <select
                  className="h-8 w-full max-w-72 rounded-md border border-border bg-background px-2 text-xs"
                  value={tuneEntry.value}
                  onChange={(e) => handleTuneChange(e.target.value)}
                >
                  {Object.entries(tuneValues).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
                <ModifiedFromDefaultDot name="TUNE" value={tuneEntry.value} />
              </span>
            ) : (
              <span className="font-mono text-xs text-muted-foreground">-</span>
            )}
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{t("ardupilotSetup.liveTuning.min")}</span>
                {numberField("TUNE_MIN")}
              </span>
              <span className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{t("ardupilotSetup.liveTuning.max")}</span>
                {numberField("TUNE_MAX")}
              </span>
            </div>
          </section>

          <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">{t("ardupilotSetup.liveTuning.liveHeading")}</h4>
            {tuneChannel === undefined ? (
              <p className="text-xs text-muted-foreground">{t("ardupilotSetup.liveTuning.noChannel")}</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="flex w-7 shrink-0 flex-col items-center gap-0.5 font-mono text-xs font-semibold" style={{ color }}>
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                    {tuneChannel}
                  </span>
                  <div className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-muted">
                    {TICK_PWM_VALUES.map((tick) => (
                      <div key={tick} className="absolute inset-y-0 w-px bg-border/70" style={{ left: `${scalePct(tick)}%` }} />
                    ))}
                    {livePwm !== undefined && (
                      <div
                        className="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full shadow-sm"
                        style={{ left: `${scalePct(livePwm)}%`, background: color }}
                      />
                    )}
                  </div>
                  <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{livePwm !== undefined ? `${livePwm} us` : "-"}</span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{t("ardupilotSetup.liveTuning.derivedValue")}</span>
                  <span className="font-mono text-sm font-semibold">{derivedValue !== undefined ? derivedValue.toFixed(3) : "-"}</span>
                </div>

                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-16 w-full rounded-md bg-muted" role="img" aria-label={t("ardupilotSetup.liveTuning.derivedValue")}>
                  {history.length > 1 && (
                    <polyline points={sparklinePoints} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  )}
                </svg>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
