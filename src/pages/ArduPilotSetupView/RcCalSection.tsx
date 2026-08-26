import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { MavResult } from "../../mavlink/registry/registry";
import type { MavlinkRcCalState } from "../../stores/mavlinkRcCalStore/types";
import { colorForRcChannel } from "./rcChannelColors";

interface RcCalSectionProps {
  live: Record<number, number>;
  chanCount: number;
  active: boolean;
  channels: MavlinkRcCalState["channels"];
  lastCommandAck: MavlinkRcCalState["lastCommandAck"];
  onStart: () => void;
  onSave: () => void;
  onCancel: () => void;
  onToggleReversed: (channel: number) => void;
}

// RC params only exist for channels 1-16 on any ArduPilot board (RC1_MIN..RC16_REVERSED),
// regardless of how many the receiver actually reports - confirmed against ArduCopter's own
// apm.pdef.xml, mirroring SERVO_CHANNEL_COUNT's same real cap in MotorsServosSection.
const MAX_CHANNELS = 16;
// A fixed reference scale (not the observed min/max) so every channel's bar has a consistent,
// comparable width - 900-2100us comfortably covers real RC PWM including typical overshoot
// past the nominal 1000-2000 range.
const SCALE_MIN = 900;
const SCALE_MAX = 2100;

function scalePct(value: number): number {
  return Math.min(100, Math.max(0, ((value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));
}

export function RcCalSection({
  live,
  chanCount,
  active,
  channels,
  lastCommandAck,
  onStart,
  onSave,
  onCancel,
  onToggleReversed,
}: RcCalSectionProps) {
  const { t } = useTranslation();
  // Real ArduPilot ACKs a pure RC-only PREFLIGHT_CALIBRATION call with MAV_RESULT_UNSUPPORTED
  // (confirmed against GCS_Common.cpp's _handle_command_preflight_calibration - it sets the RC
  // "calibrating" flag as a side effect, then falls through every accel/gyro/baro branch to the
  // default UNSUPPORTED return) - that is the NORMAL outcome here, not a rejection. Only FAILED
  // (armed) is a real problem worth surfacing.
  const armedRejection = lastCommandAck !== null && lastCommandAck.result === MavResult.FAILED;

  const displayedChannels = (active ? Object.keys(channels) : Object.keys(live))
    .map(Number)
    .filter((channel) => channel <= MAX_CHANNELS)
    .sort((a, b) => a - b);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.rcCal.heading")}</h3>
        {!active ? (
          <Button type="button" size="sm" onClick={onStart}>
            {t("ardupilotSetup.rcCal.start")}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              {t("ardupilotSetup.rcCal.cancel")}
            </Button>
            <Button type="button" size="sm" onClick={onSave}>
              {t("ardupilotSetup.rcCal.save")}
            </Button>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t("ardupilotSetup.rcCal.description")}</p>

      {armedRejection && (
        <Alert variant="destructive">
          <AlertDescription>{t("ardupilotSetup.rcCal.armedRejection")}</AlertDescription>
        </Alert>
      )}

      {/* Suppressed once the vehicle has actually rejected the calibration attempt (armedRejection
          above) - "move your sticks now" reads as actively contradicting "this was just
          rejected" when both show at once. */}
      {active && !armedRejection && (
        <Alert variant="warning" className="shrink-0">
          <AlertDescription>{t("ardupilotSetup.rcCal.movePrompt")}</AlertDescription>
        </Alert>
      )}

      {displayedChannels.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("ardupilotSetup.rcCal.noSignal")}</p>
      ) : (
        <>
          {!active && <p className="text-xs text-muted-foreground">{t("ardupilotSetup.rcCal.liveHint", { count: chanCount })}</p>}
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {displayedChannels.map((channel) => {
              const raw = live[channel];
              const range = channels[channel];
              const color = colorForRcChannel(channel);
              return (
                <div key={channel} className="flex items-center gap-3 text-xs">
                  <span
                    className="flex w-6 shrink-0 items-center gap-1 font-mono text-muted-foreground"
                    style={{ color }}
                  >
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                    {channel}
                  </span>
                  <div className="relative h-3 min-w-0 flex-1 rounded-full bg-muted">
                    {range && (
                      <div
                        className="absolute inset-y-0 rounded-full bg-primary/25"
                        style={{ left: `${scalePct(range.min)}%`, right: `${100 - scalePct(range.max)}%` }}
                      />
                    )}
                    {range && (
                      <div
                        className="absolute inset-y-0 w-px bg-primary"
                        style={{ left: `${scalePct(range.trim)}%` }}
                      />
                    )}
                    {raw !== undefined && (
                      <div
                        className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full border border-background"
                        style={{ left: `${scalePct(raw)}%`, background: color }}
                      />
                    )}
                  </div>
                  <span className="w-12 shrink-0 text-right font-mono text-muted-foreground">
                    {raw !== undefined ? raw : "-"}
                  </span>
                  {active && (
                    <label className="flex shrink-0 items-center gap-1">
                      <input
                        type="checkbox"
                        checked={range?.reversed ?? false}
                        onChange={() => onToggleReversed(channel)}
                      />
                      {t("ardupilotSetup.rcCal.reverse")}
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
