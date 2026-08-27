import { ArrowLeft, RadioTower } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/**
 * Pre-flight site planning: place a home position plus beacons/antennas on a real terrain
 * map, save the layout, and preview line-of-sight coverage - see the "Ground Station" plan.
 * This is the Phase 0 shell only (the route + a landing spot to navigate to); the actual map,
 * device placement, and coverage rendering land in later phases.
 */
export function GroundStationView() {
  const { t } = useTranslation();

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <Link to="/" className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {t("groundStation.backToHome")}
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-4">
        <div className="flex max-w-md flex-col items-center gap-2 text-center">
          <RadioTower className="h-8 w-8 text-primary" />
          <h1 className="text-lg font-bold">{t("groundStation.heading")}</h1>
          <p className="text-sm text-muted-foreground">{t("groundStation.description")}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t("groundStation.comingSoon")}</p>
        </div>
      </main>
    </div>
  );
}
