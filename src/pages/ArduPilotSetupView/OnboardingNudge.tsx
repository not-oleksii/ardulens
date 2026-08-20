import { Cog, Compass, Joystick, MoveDiagonal, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ONBOARDING_NUDGE_DISMISSED_STORAGE_KEY } from "../../constants";
import type { ArduPilotSetupSection } from "./ArduPilotSetupSidebar";

interface OnboardingNudgeProps {
  onNavigate: (section: ArduPilotSetupSection) => void;
}

// A suggested order, not a gate - every section stays reachable via the sidebar at any time
// regardless of what's been done here. Mirrors the order most GCS setup wizards use for a
// fresh vehicle: level/orient the accelerometer and compass first since later steps (RC/motor
// direction, PID behavior) are only meaningful once the vehicle knows which way is up.
const STEPS: { section: ArduPilotSetupSection; icon: typeof Compass }[] = [
  { section: "accelCal", icon: MoveDiagonal },
  { section: "compassCal", icon: Compass },
  { section: "rcCal", icon: Joystick },
  { section: "motorsSetup", icon: Cog },
  { section: "pidTune", icon: SlidersHorizontal },
];

/** A one-time, dismissible nudge shown on first connection, suggesting a setup order for a
 *  fresh vehicle - see STEPS above. Purely a suggestion: dismissing it (or just navigating
 *  away) never blocks or hides any section. */
export function OnboardingNudge({ onNavigate }: OnboardingNudgeProps) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(ONBOARDING_NUDGE_DISMISSED_STORAGE_KEY) === "1");

  function dismiss() {
    localStorage.setItem(ONBOARDING_NUDGE_DISMISSED_STORAGE_KEY, "1");
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <Alert variant="info" className="relative">
      <AlertTitle>{t("ardupilotSetup.onboarding.title")}</AlertTitle>
      <AlertDescription>
        <p>{t("ardupilotSetup.onboarding.description")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {STEPS.map(({ section, icon: Icon }, i) => (
            <Button
              key={section}
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => onNavigate(section)}
            >
              <span className="font-mono text-xs text-muted-foreground">{i + 1}.</span>
              <Icon className="h-3.5 w-3.5" />
              {t(`ardupilotSetup.sidebar.${section}`)}
            </Button>
          ))}
        </div>
      </AlertDescription>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 h-6 w-6"
        aria-label={t("ardupilotSetup.onboarding.dismiss")}
        onClick={dismiss}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </Alert>
  );
}
