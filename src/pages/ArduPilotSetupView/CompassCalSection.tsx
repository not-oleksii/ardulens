import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CompassCoverageSphere } from "../../components/CompassCoverageSphere/CompassCoverageSphere";
import { magCalStatusLabel, mavResultLabel } from "../../mavlink/labels/labels";
import { MagCalStatus, MavResult } from "../../mavlink/registry/registry";
import type { CompassCalCommandAck, CompassCalProgress, CompassCalReport } from "../../stores/mavlinkCompassCalStore/types";

interface CompassCalSectionProps {
  progress: Record<number, CompassCalProgress>;
  reports: Record<number, CompassCalReport>;
  lastCommandAck: CompassCalCommandAck | null;
  onStart: () => void;
  onAccept: () => void;
  onCancel: () => void;
  onReboot: () => void;
}

const FULLY_COVERED_MASK = new Array(10).fill(0xff);

export function CompassCalSection({ progress, reports, lastCommandAck, onStart, onAccept, onCancel, onReboot }: CompassCalSectionProps) {
  const { t } = useTranslation();
  // Optimistic - DO_ACCEPT_MAG_CAL doesn't reliably produce a distinct "now saved" message of
  // its own, so once the user confirms, we just trust the command was sent (its COMMAND_ACK is
  // still surfaced above if it was rejected) rather than waiting on a signal that may not come.
  const [accepted, setAccepted] = useState(false);
  // Rebooting isn't required for compass offsets themselves to take effect (DO_ACCEPT_MAG_CAL
  // writes them immediately, same as any other AP_Float param) - offered as an optional
  // follow-up anyway, matching the "Reboot Now" affordance MotorsCopterSection already shows
  // after a RebootRequired param change, since a full reboot is still the most reliable way to
  // confirm the new offsets are actually the ones in effect before flying.
  const [rebootSent, setRebootSent] = useState(false);

  const compassIds = Array.from(new Set([...Object.keys(progress), ...Object.keys(reports)].map(Number))).sort((a, b) => a - b);
  const hasAnyData = compassIds.length > 0;
  const allDone = hasAnyData && compassIds.every((id) => reports[id] !== undefined);
  const anySuccess = compassIds.some((id) => reports[id]?.calStatus === MagCalStatus.SUCCESS);

  // "accepted" only ever needs clearing at the moments the user actively starts a fresh
  // attempt or backs out of the current one - driving it from those handlers directly (rather
  // than reactively watching hasAnyData in an effect) avoids a setState-in-effect cascade.
  function handleStart() {
    setAccepted(false);
    setRebootSent(false);
    onStart();
  }

  function handleCancel() {
    setAccepted(false);
    setRebootSent(false);
    onCancel();
  }

  function handleAccept() {
    onAccept();
    setAccepted(true);
  }

  function handleReboot() {
    onReboot();
    setRebootSent(true);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.compassCal.heading")}</h3>
        <div className="flex items-center gap-2">
          {!hasAnyData ? (
            <Button type="button" size="sm" onClick={handleStart}>
              {t("ardupilotSetup.compassCal.start")}
            </Button>
          ) : (
            !accepted && (
              <>
                <Button type="button" size="sm" variant="ghost" onClick={handleCancel}>
                  {t("ardupilotSetup.compassCal.cancel")}
                </Button>
                {allDone && anySuccess && (
                  <Button type="button" size="sm" onClick={handleAccept}>
                    {t("ardupilotSetup.compassCal.accept")}
                  </Button>
                )}
              </>
            )
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t("ardupilotSetup.compassCal.description")}</p>

      {accepted ? (
        <div className="flex flex-col gap-2">
          <Alert variant="info">
            <AlertDescription>{t("ardupilotSetup.compassCal.saved")}</AlertDescription>
          </Alert>
          {!rebootSent ? (
            <Button type="button" size="sm" variant="outline" className="w-fit" onClick={handleReboot}>
              {t("ardupilotSetup.compassCal.reboot")}
            </Button>
          ) : (
            <Alert variant="info">
              <AlertDescription>{t("ardupilotSetup.compassCal.rebootSent")}</AlertDescription>
            </Alert>
          )}
        </div>
      ) : (
        lastCommandAck &&
        lastCommandAck.result !== MavResult.ACCEPTED && (
          <Alert variant="destructive">
            <AlertDescription>
              {t("ardupilotSetup.compassCal.commandRejected", { result: mavResultLabel(t, lastCommandAck.result) })}
            </AlertDescription>
          </Alert>
        )
      )}

      {!hasAnyData ? (
        <p className="text-xs text-muted-foreground">{t("ardupilotSetup.compassCal.notStarted")}</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
          {compassIds.map((id) => {
            const report = reports[id];
            const prog = progress[id];
            const calStatus = report?.calStatus ?? prog?.calStatus ?? MagCalStatus.NOT_STARTED;
            const completionPct = report ? 100 : (prog?.completionPct ?? 0);
            const completionMask = report ? FULLY_COVERED_MASK : (prog?.completionMask ?? new Array(10).fill(0));

            return (
              <div key={id} className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-center">
                <p className="text-sm font-medium">{t("ardupilotSetup.compassCal.compass", { id })}</p>
                <CompassCoverageSphere completionMask={completionMask} completionPct={completionPct} size={180} />
                <p className="text-xs text-muted-foreground">{magCalStatusLabel(t, calStatus)}</p>
                <p className="font-mono text-sm">{Math.round(completionPct)}%</p>
                {report && (
                  <p className="text-xs text-muted-foreground">
                    {t("ardupilotSetup.compassCal.fitness", { value: report.fitness.toFixed(1) })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
