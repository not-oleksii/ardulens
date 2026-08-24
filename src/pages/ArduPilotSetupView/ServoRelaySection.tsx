import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { colorForRcChannel } from "./rcChannelColors";

interface ServoRelaySectionProps {
  servoOutputs: Record<number, number>;
  onSetServoPwm: (channel: number, pwm: number) => void;
  onSetRelay: (instance: number, on: boolean) => void;
}

const SERVO_CHANNEL_COUNT = 16;
// ArduPilot conventionally exposes up to 6 relay outputs (RELAY1_FUNCTION..RELAY6_FUNCTION) -
// unlike servo channels, this app has no live telemetry to derive an "actually configured"
// count from (see the registry.ts comment on DoSetRelayCommand), so a fixed set matching
// Mission Planner's own Servo/Relay tab (which also always shows a fixed set, not a
// param-derived one) is shown regardless of what's actually wired up.
const RELAY_CHANNEL_COUNT = 6;
const DEFAULT_MIN = 1000;
const DEFAULT_MAX = 2000;
const DEFAULT_TRIM = 1500;

// Same 900-2100us reference scale MotorsServosSection/RcCalSection/RcSetupSection's live bars
// already use, so a channel's live position looks the same everywhere it's shown in this app.
const SCALE_MIN = 900;
const SCALE_MAX = 2100;
function scalePct(value: number): number {
  return Math.min(100, Math.max(0, ((value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));
}

/** Mission Planner's "Servos/Relay" tab - ad-hoc bench testing, deliberately distinct from
 *  MotorsServosSection's press-and-hold spin test: an override here is PERSISTENT (stays at
 *  whatever value you set, matching Mission Planner's own behavior) rather than momentary, since
 *  the point is being able to hold a gimbal/landing-gear/etc. at a fixed position, not just
 *  confirm which output moves. */
export function ServoRelaySection({ servoOutputs, onSetServoPwm, onSetRelay }: ServoRelaySectionProps) {
  const { t } = useTranslation();
  // Local text-input staging per channel, separate from what's actually been sent - the slider
  // itself still sends live (matching Mission Planner's own behavior), but the numeric field
  // commits on blur/Enter like every other numeric editor in this app.
  const [pwmDraft, setPwmDraft] = useState<Record<number, string>>({});
  const [relayOn, setRelayOn] = useState<Record<number, boolean>>({});
  // Which servo channels have actually been overridden this session - only these get released
  // back to trim on unmount (untouched channels are left alone). Relays deliberately do NOT
  // auto-release: unlike a servo override (which can fight the flight controller's own control
  // loop for a flight surface), a relay is typically driving auxiliary equipment (lights, a
  // camera, a parachute release) where "leave it in whatever state I set" is correct - matching
  // Mission Planner's own tab, which doesn't turn relays off when you navigate away either.
  const touchedServoChannels = useRef<Set<number>>(new Set());
  const onSetServoPwmRef = useRef(onSetServoPwm);
  useEffect(() => {
    onSetServoPwmRef.current = onSetServoPwm;
  }, [onSetServoPwm]);

  useEffect(() => {
    // The Set object itself (not its contents) is what's captured here - it's the same
    // instance for the component's whole lifetime (created once via useRef), so reading it at
    // cleanup time still reflects every channel touched up to that point, unlike a ref pointing
    // at a DOM node (which the exhaustive-deps warning this silences is really guarding against).
    const touched = touchedServoChannels.current;
    return () => {
      for (const channel of touched) {
        onSetServoPwmRef.current(channel, DEFAULT_TRIM);
      }
    };
  }, []);

  function sendPwm(channel: number, pwm: number) {
    touchedServoChannels.current.add(channel);
    onSetServoPwm(channel, pwm);
  }

  function releaseServo(channel: number) {
    touchedServoChannels.current.delete(channel);
    setPwmDraft((prev) => {
      const next = { ...prev };
      delete next[channel];
      return next;
    });
    onSetServoPwm(channel, DEFAULT_TRIM);
  }

  function commitDraft(channel: number) {
    const raw = pwmDraft[channel];
    if (raw === undefined) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    sendPwm(channel, Math.round(Math.min(DEFAULT_MAX, Math.max(DEFAULT_MIN, parsed))));
  }

  function toggleRelay(instance: number) {
    const next = !(relayOn[instance] ?? false);
    setRelayOn((prev) => ({ ...prev, [instance]: next }));
    onSetRelay(instance, next);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <h3 className="shrink-0 text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.servoRelay.heading")}</h3>

      <Alert variant="warning" className="shrink-0">
        <AlertDescription>{t("ardupilotSetup.servoRelay.safetyWarning")}</AlertDescription>
      </Alert>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-2">
          <h4 className="shrink-0 text-xs font-bold tracking-wide uppercase text-muted-foreground">
            {t("ardupilotSetup.servoRelay.servosHeading")}
          </h4>
          <div className="min-h-0 overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>{t("ardupilotSetup.motorsServos.channel")}</TableHead>
                  <TableHead>{t("ardupilotSetup.motorsServos.output")}</TableHead>
                  <TableHead>{t("ardupilotSetup.servoRelay.override")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: SERVO_CHANNEL_COUNT }, (_, i) => i + 1).map((channel) => {
                  const liveOutput = servoOutputs[channel];
                  const color = colorForRcChannel(channel);
                  const draft = pwmDraft[channel] ?? String(liveOutput ?? DEFAULT_TRIM);
                  const sliderValue = Number(draft);
                  return (
                    <TableRow key={channel}>
                      <TableCell className="font-mono" style={{ color }}>
                        {channel}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <div className="relative h-3 w-14 shrink-0 rounded-full bg-muted">
                            {liveOutput !== undefined && (
                              <div
                                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background"
                                style={{ left: `${scalePct(liveOutput)}%`, background: color }}
                              />
                            )}
                          </div>
                          <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                            {liveOutput !== undefined ? `${liveOutput}` : "-"}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <input
                            type="range"
                            min={DEFAULT_MIN}
                            max={DEFAULT_MAX}
                            value={Number.isFinite(sliderValue) ? sliderValue : DEFAULT_TRIM}
                            onChange={(e) => {
                              setPwmDraft((prev) => ({ ...prev, [channel]: e.target.value }));
                              sendPwm(channel, Number(e.target.value));
                            }}
                            className="w-20"
                          />
                          <Input
                            value={draft}
                            onChange={(e) => setPwmDraft((prev) => ({ ...prev, [channel]: e.target.value }))}
                            onBlur={() => commitDraft(channel)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitDraft(channel);
                            }}
                            className="h-7 w-16 font-mono text-xs"
                          />
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button type="button" size="sm" variant="ghost" onClick={() => releaseServo(channel)}>
                          {t("ardupilotSetup.servoRelay.release")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <h4 className="shrink-0 text-xs font-bold tracking-wide uppercase text-muted-foreground">
            {t("ardupilotSetup.servoRelay.relaysHeading")}
          </h4>
          <div className="grid grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {/* Relay numbering here matches DO_SET_SERVO's own already-shipped convention in
                this app (see handleSetServoPwm - `instance` sent 1:1 with the 1-indexed channel
                shown in the UI, matching SERVOn_FUNCTION's naming) applied to DO_SET_RELAY too,
                for consistency with RELAY1_FUNCTION-style 1-indexed param naming - MAVLink's own
                common.xml just says "min: 0" for both commands' Instance field, which turned out
                to be a generic non-negative constraint, not a "0 is the first channel" hint, once
                confirmed against DO_SET_SERVO's real working behavior in this exact app. */}
            {Array.from({ length: RELAY_CHANNEL_COUNT }, (_, i) => i + 1).map((instance) => {
              const on = relayOn[instance] ?? false;
              return (
                <div key={instance} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <span className="font-mono text-xs">{t("ardupilotSetup.servoRelay.relayLabel", { instance })}</span>
                  <Button type="button" size="sm" variant={on ? "default" : "outline"} onClick={() => toggleRelay(instance)}>
                    {t(on ? "ardupilotSetup.servoRelay.on" : "ardupilotSetup.servoRelay.off")}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
