import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface EscCalSectionProps {
  onStart: () => void;
}

// ESC_CALIBRATION=3 ("Auto") is the value ArduPilot's own docs specify for a software-triggered
// calibration - confirmed against ArduPilot's own
// ArduCopter/esc_calibration.cpp: this mode drives max throttle for 5s then zero throttle to
// every output entirely from firmware after the next reboot, no further stick/throttle input
// needed from the pilot, and esc_calibrate resets itself back to 0 once done. The same
// startup check also runs on a *software* reboot (not just a physical power-cycle), so this
// can be fully GCS-driven: set the param, then send the same PREFLIGHT_REBOOT_SHUTDOWN command
// Motors & Servos' "Reboot Now" button already uses.
export function EscCalSection({ onStart }: EscCalSectionProps) {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);
  // Drives every ESC to full throttle for several seconds with no further confirmation once
  // started - same confirm-before-send treatment as Arm/Takeoff/RTL, rather than the instant
  // commit a stray click used to produce.
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleStart() {
    setConfirmOpen(false);
    setStarted(true);
    onStart();
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.escCal.heading")}</h3>
      <p className="text-xs text-muted-foreground">{t("ardupilotSetup.escCal.description")}</p>
      <Alert variant="warning" className="shrink-0">
        <AlertDescription>{t("ardupilotSetup.escCal.safetyWarning")}</AlertDescription>
      </Alert>
      <Button type="button" onClick={() => setConfirmOpen(true)} className="w-fit">
        {t("ardupilotSetup.escCal.start")}
      </Button>
      {started && (
        <Alert variant="info" className="shrink-0">
          <AlertDescription>{t("ardupilotSetup.escCal.started")}</AlertDescription>
        </Alert>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.escCal.confirmStartTitle")}</DialogTitle>
            <DialogDescription>{t("ardupilotSetup.escCal.confirmStartDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("ardupilotSetup.escCal.cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={handleStart}>
              {t("ardupilotSetup.escCal.confirmStart")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
