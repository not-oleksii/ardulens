import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { accelcalVehiclePosLabel, mavResultLabel } from "../../mavlink/labels/labels";
import { AccelcalVehiclePos, MavResult } from "../../mavlink/registry/registry";
import type { AccelCalCommandAck } from "../../stores/mavlinkAccelCalStore/types";

interface AccelCalSectionProps {
  activeCalType: "level" | "full" | null;
  requestedPosition: number | null;
  confirmedPositions: number[];
  result: "success" | "failed" | null;
  lastCommandAck: AccelCalCommandAck | null;
  onStartLevel: () => void;
  onStartFull: () => void;
  onConfirmPosition: (position: number) => void;
  onCancel: () => void;
}

// The 6 real positions a full accel cal steps through, in the order ArduPilot itself requests
// them - used only for the checklist display, not to drive the protocol (the vehicle, not this
// list, decides what to request next).
const ALL_POSITIONS = [
  AccelcalVehiclePos.LEVEL,
  AccelcalVehiclePos.LEFT,
  AccelcalVehiclePos.RIGHT,
  AccelcalVehiclePos.NOSEDOWN,
  AccelcalVehiclePos.NOSEUP,
  AccelcalVehiclePos.BACK,
];

// How long the countdown ring gives the user to hold the vehicle still before auto-confirming
// the current position - long enough to finish repositioning a real vehicle by hand, short
// enough that stepping through all 6 positions doesn't feel slower than the old click-per-
// position flow. Ticks at 10Hz, smooth enough for the ring to read as continuous motion rather
// than visibly stepping.
const AUTO_CONFIRM_DURATION_MS = 5000;
const AUTO_CONFIRM_TICK_MS = 100;
const RING_RADIUS = 28;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** The countdown ring + auto-confirm timer for one requested position. Rendered with
 *  `key={requestedPosition}` by the parent so a fresh position gets a fresh mount - the
 *  idiomatic React way to "reset state when a prop changes", used here instead of a
 *  setState-in-effect that would otherwise fire mid-render on every position change. Clicking
 *  the ring confirms immediately, for a user who doesn't want to wait out the countdown. */
function AccelCalCountdown({ onComplete, confirmLabel }: { onComplete: () => void; confirmLabel: string }) {
  const [remainingMs, setRemainingMs] = useState(AUTO_CONFIRM_DURATION_MS);

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const remaining = AUTO_CONFIRM_DURATION_MS - (Date.now() - startedAt);
      if (remaining <= 0) {
        window.clearInterval(interval);
        setRemainingMs(0);
        onComplete();
        return;
      }
      setRemainingMs(remaining);
    }, AUTO_CONFIRM_TICK_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onComplete intentionally excluded: this component remounts fresh (via the parent's `key={requestedPosition}`) for every new position, so the timer only ever needs to start once per mount, not react to onComplete's identity changing across parent re-renders
  }, []);

  const progress = Math.max(0, Math.min(1, remainingMs / AUTO_CONFIRM_DURATION_MS));
  return (
    <button
      type="button"
      onClick={onComplete}
      className="relative flex h-16 w-16 items-center justify-center rounded-full text-xs font-semibold text-muted-foreground hover:text-foreground"
      title={confirmLabel}
    >
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r={RING_RADIUS} className="fill-none stroke-border" strokeWidth="4" />
        <circle
          cx="32"
          cy="32"
          r={RING_RADIUS}
          className="fill-none stroke-primary transition-[stroke-dashoffset]"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
        />
      </svg>
      <span data-testid="accel-cal-countdown-seconds">{Math.ceil(remainingMs / 1000)}</span>
    </button>
  );
}

export function AccelCalSection({
  activeCalType,
  requestedPosition,
  confirmedPositions,
  result,
  lastCommandAck,
  onStartLevel,
  onStartFull,
  onConfirmPosition,
  onCancel,
}: AccelCalSectionProps) {
  const { t } = useTranslation();
  const levelCalDone = activeCalType === "level" && lastCommandAck !== null;
  // The full cal is "active" until a terminal result arrives; the one-shot level cal is
  // "active" only until its own ack arrives (it has no further progress to wait on).
  const isActive = activeCalType === "full" ? result === null : activeCalType === "level" ? !levelCalDone : false;
  const commandRejected = lastCommandAck !== null && lastCommandAck.result !== MavResult.ACCEPTED;

  // Defaults OFF (Wave 3 of the UI/UX audit reversed the earlier default-on choice) - a wrong-
  // orientation reading can silently corrupt the calibration if the user hasn't finished
  // repositioning the vehicle within the 5s window, and that failure mode is invisible until
  // the finished calibration is already bad. Auto-confirm stays available as an opt-in speed-up
  // for a user who already knows the flow, not the default a first-time user falls into.
  const [autoConfirm, setAutoConfirm] = useState(false);

  return (
    // h-full only while an active/finished calibration has content that wants centering in
    // the available space - the plain "not started" idle state is just one status line and
    // shouldn't stretch to fill the page.
    <div className={cn("flex flex-col gap-4", (activeCalType !== null || result !== null) && "h-full")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.accelCal.heading")}</h3>
        <div className="flex items-center gap-2">
          {!isActive ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={onStartLevel}>
                {t("ardupilotSetup.accelCal.startLevel")}
              </Button>
              <Button type="button" size="sm" onClick={onStartFull}>
                {t("ardupilotSetup.accelCal.startFull")}
              </Button>
            </>
          ) : (
            activeCalType === "full" && (
              <>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={autoConfirm} onChange={(e) => setAutoConfirm(e.target.checked)} />
                  {t("ardupilotSetup.accelCal.autoConfirmToggle", { seconds: AUTO_CONFIRM_DURATION_MS / 1000 })}
                </label>
                <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
                  {t("ardupilotSetup.accelCal.cancel")}
                </Button>
              </>
            )
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t("ardupilotSetup.accelCal.description")}</p>

      {commandRejected && (
        <Alert variant="destructive">
          <AlertDescription>
            {t("ardupilotSetup.accelCal.commandRejected", { result: mavResultLabel(t, lastCommandAck.result) })}
          </AlertDescription>
        </Alert>
      )}

      {activeCalType === null && result === null && !levelCalDone && (
        <p className="text-xs text-muted-foreground">{t("ardupilotSetup.accelCal.notStarted")}</p>
      )}

      {activeCalType === "level" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          {!lastCommandAck ? (
            <p className="text-sm text-muted-foreground">{t("ardupilotSetup.accelCal.levelInProgress")}</p>
          ) : lastCommandAck.result === MavResult.ACCEPTED ? (
            <Alert variant="info">
              <AlertDescription>{t("ardupilotSetup.accelCal.levelSuccess")}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      )}

      {(activeCalType === "full" || result !== null) && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          {result === "success" ? (
            <Alert variant="info">
              <AlertDescription>{t("ardupilotSetup.accelCal.fullSuccess")}</AlertDescription>
            </Alert>
          ) : result === "failed" ? (
            <Alert variant="destructive">
              <AlertDescription>{t("ardupilotSetup.accelCal.fullFailed")}</AlertDescription>
            </Alert>
          ) : (
            requestedPosition !== null && (
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="text-xs text-muted-foreground">{t("ardupilotSetup.accelCal.movePrompt")}</p>
                <p className="text-2xl font-bold" data-testid="accel-cal-position-prompt">
                  {accelcalVehiclePosLabel(t, requestedPosition)}
                </p>
                {autoConfirm ? (
                  <AccelCalCountdown
                    key={requestedPosition}
                    onComplete={() => onConfirmPosition(requestedPosition)}
                    confirmLabel={t("ardupilotSetup.accelCal.confirmPosition")}
                  />
                ) : (
                  <Button type="button" onClick={() => onConfirmPosition(requestedPosition)}>
                    {t("ardupilotSetup.accelCal.confirmPosition")}
                  </Button>
                )}
              </div>
            )
          )}

          <div className="flex flex-wrap justify-center gap-2">
            {ALL_POSITIONS.map((position) => {
              const done = confirmedPositions.includes(position);
              const current = requestedPosition === position;
              return (
                <div
                  key={position}
                  data-testid={`accel-cal-checklist-${position}`}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-3 py-1 text-xs",
                    done
                      ? "border-primary bg-primary/10 text-primary"
                      : current
                        ? "border-foreground"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {done && <Check className="h-3 w-3" />}
                  {accelcalVehiclePosLabel(t, position)}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
