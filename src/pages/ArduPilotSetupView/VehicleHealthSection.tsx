import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { MavSysStatusSensor } from "../../mavlink/registry/registry";
import type { SensorHealthTelemetry } from "../../stores/mavlinkTelemetryStore/types";

interface VehicleHealthSectionProps {
  sensorHealth: SensorHealthTelemetry | null;
}

/**
 * "Is it safe to arm, at a glance" - a single one-line badge, nothing else. This used to also
 * list every individual unhealthy sensor plus recent failure STATUSTEXT messages directly on the
 * PFD, but a common real cascade (losing GPS/EKF routinely takes rate control, attitude/yaw/
 * altitude/position control, and AHRS down with it, since they all depend on the EKF's estimate)
 * made that list long enough to be its own source of noise on top of the horizon display. The
 * full per-sensor breakdown now lives in the PreFlight tab (PreflightChecklistSection.tsx,
 * alongside Stats/Messages under the PFD) and the message history in the Messages tab - this
 * overlay is just the headline signal pointing there. Renders nothing when arming would pass,
 * per the UX feedback that prompted the original version: an always-visible healthy checklist was
 * mostly noise too.
 *
 * Rendered via PrimaryFlightDisplay's `warningOverlay` slot (see TelemetrySection.tsx), which
 * positions it as an overlay on the lower portion of the horizon circle rather than in normal
 * document flow - so it never pushes the rest of the page down when a problem appears or clears.
 */
export function VehicleHealthSection({ sensorHealth }: VehicleHealthSectionProps) {
  const { t } = useTranslation();

  const prearmPresent = sensorHealth ? (sensorHealth.present & MavSysStatusSensor.PREARM_CHECK) !== 0 : false;
  const prearmFailing = prearmPresent && sensorHealth !== null && (sensorHealth.health & MavSysStatusSensor.PREARM_CHECK) === 0;

  if (!prearmFailing) return null;

  return (
    <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-card/95 p-1.5 text-xs shadow-md">
      <Badge variant="critical" className="font-bold tracking-wide">
        {t("ardupilotSetup.health.prearmFailing")}
      </Badge>
    </div>
  );
}
