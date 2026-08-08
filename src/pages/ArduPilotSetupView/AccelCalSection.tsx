import { Check } from "lucide-react";
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

  return (
    <div className="flex h-full flex-col gap-4">
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
              <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
                {t("ardupilotSetup.accelCal.cancel")}
              </Button>
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
                <Button type="button" onClick={() => onConfirmPosition(requestedPosition)}>
                  {t("ardupilotSetup.accelCal.confirmPosition")}
                </Button>
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
