import { CircleAlert, CircleCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { sensorHint, sensorLabel } from "../../mavlink/labels/labels";
import { MavSysStatusSensor } from "../../mavlink/registry/registry";
import type { SensorHealthTelemetry } from "../../stores/mavlinkTelemetryStore/types";

interface PreflightChecklistSectionProps {
  sensorHealth: SensorHealthTelemetry | null;
}

// Display order, not a completeness requirement - only bits actually PRESENT on this vehicle get
// rendered (see the filter below); which of those are also unhealthy just changes their row's
// styling, rather than which rows appear at all.
const SENSOR_ORDER: MavSysStatusSensor[] = [
  MavSysStatusSensor.SENSOR_3D_GYRO,
  MavSysStatusSensor.SENSOR_3D_ACCEL,
  MavSysStatusSensor.SENSOR_3D_MAG,
  MavSysStatusSensor.SENSOR_ABSOLUTE_PRESSURE,
  MavSysStatusSensor.SENSOR_GPS,
  MavSysStatusSensor.SENSOR_DIFFERENTIAL_PRESSURE,
  MavSysStatusSensor.SENSOR_OPTICAL_FLOW,
  MavSysStatusSensor.SENSOR_VISION_POSITION,
  MavSysStatusSensor.SENSOR_LASER_POSITION,
  MavSysStatusSensor.SENSOR_EXTERNAL_GROUND_TRUTH,
  MavSysStatusSensor.SENSOR_ANGULAR_RATE_CONTROL,
  MavSysStatusSensor.SENSOR_ATTITUDE_STABILIZATION,
  MavSysStatusSensor.SENSOR_YAW_POSITION,
  MavSysStatusSensor.SENSOR_Z_ALTITUDE_CONTROL,
  MavSysStatusSensor.SENSOR_XY_POSITION_CONTROL,
  MavSysStatusSensor.SENSOR_MOTOR_OUTPUTS,
  MavSysStatusSensor.SENSOR_RC_RECEIVER,
  MavSysStatusSensor.SENSOR_3D_GYRO2,
  MavSysStatusSensor.SENSOR_3D_ACCEL2,
  MavSysStatusSensor.SENSOR_3D_MAG2,
  MavSysStatusSensor.GEOFENCE,
  MavSysStatusSensor.AHRS,
  MavSysStatusSensor.TERRAIN,
  MavSysStatusSensor.REVERSE_MOTOR,
  MavSysStatusSensor.LOGGING,
  MavSysStatusSensor.SENSOR_BATTERY,
  MavSysStatusSensor.SENSOR_PROXIMITY,
  MavSysStatusSensor.SENSOR_SATCOM,
  MavSysStatusSensor.OBSTACLE_AVOIDANCE,
  MavSysStatusSensor.SENSOR_PROPULSION,
];

/**
 * The full per-sensor breakdown - every present sensor, healthy or not - that used to live
 * directly on the PFD overlay (VehicleHealthSection.tsx) before that got too noisy once several
 * sensors went unhealthy together (a real, common cascade: losing GPS/EKF routinely takes rate
 * control, attitude/yaw/altitude/position control, and AHRS down with it, since they all depend
 * on the EKF's estimate). The PFD overlay now shows just a one-line "pre-arm checks failing"
 * signal; this tab is where the actual per-sensor detail lives.
 */
export function PreflightChecklistSection({ sensorHealth }: PreflightChecklistSectionProps) {
  const { t } = useTranslation();

  if (!sensorHealth) {
    return <p className="text-xs text-muted-foreground">{t("ardupilotSetup.telemetry.waitingForTelemetry")}</p>;
  }

  const presentSensors = SENSOR_ORDER.filter((bit) => (sensorHealth.present & bit) !== 0);
  if (presentSensors.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("ardupilotSetup.telemetry.waitingForTelemetry")}</p>;
  }

  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto text-xs">
      {presentSensors.map((bit) => {
        const healthy = (sensorHealth.health & bit) !== 0;
        const label = sensorLabel(t, bit);
        const icon = healthy ? (
          <CircleCheck className="h-3 w-3 shrink-0 text-ardulens-status-good" aria-hidden="true" />
        ) : (
          <CircleAlert className="h-3 w-3 shrink-0 text-destructive" aria-hidden="true" />
        );
        const textClassName = healthy ? "text-muted-foreground" : "font-semibold text-destructive";

        // Hover hints (cause/fix) are only meaningful - and only defined - for failure cases.
        const hint = healthy ? null : sensorHint(t, bit);
        if (!hint) {
          return (
            <li key={bit} className="flex items-center gap-1.5">
              {icon}
              <span className={textClassName}>{label}</span>
            </li>
          );
        }
        return (
          <li key={bit}>
            <HoverCard>
              <HoverCardTrigger asChild>
                <button type="button" className="flex items-center gap-1.5 cursor-default">
                  {icon}
                  <span className={textClassName}>{label}</span>
                </button>
              </HoverCardTrigger>
              <HoverCardContent className="w-80 text-xs">
                <p className="font-semibold text-destructive">{label}</p>
                <p className="mt-1.5 text-muted-foreground">{hint.cause}</p>
                <p className="mt-1.5">{hint.fix}</p>
              </HoverCardContent>
            </HoverCard>
          </li>
        );
      })}
    </ul>
  );
}
