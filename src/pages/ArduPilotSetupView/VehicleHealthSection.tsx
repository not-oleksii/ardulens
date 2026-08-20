import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { sensorHint, sensorLabel } from "../../mavlink/labels/labels";
import { MavSeverity, MavSysStatusSensor } from "../../mavlink/registry/registry";
import type { StatusTextEntry } from "../../stores/mavlinkStatusTextStore/types";
import type { SensorHealthTelemetry } from "../../stores/mavlinkTelemetryStore/types";

interface VehicleHealthSectionProps {
  sensorHealth: SensorHealthTelemetry | null;
  messages: StatusTextEntry[];
}

// Display order, not a completeness requirement - only bits actually PRESENT and UNHEALTHY on
// this vehicle get rendered (see the filter below).
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

// WARNING(4) and more severe only - NOTICE/INFO/DEBUG are routine chatter, not a failure worth
// surfacing here (this view is failures-only by design, see the component comment below).
function isFailureSeverity(severity: MavSeverity): boolean {
  return severity <= MavSeverity.WARNING;
}

function messageClassName(severity: MavSeverity): string {
  return severity <= MavSeverity.ERROR ? "text-destructive font-semibold" : "text-amber-700 dark:text-amber-400";
}

/**
 * "Why won't it arm" - failures only (unhealthy present sensors, a failing PREARM_CHECK, and
 * STATUSTEXT messages at WARNING or worse - e.g. ArduPilot's own "PreArm: Compass not
 * calibrated"). Renders nothing when everything's fine, per the UX feedback that prompted this:
 * an always-visible checklist of healthy sensors was mostly noise.
 *
 * Rendered via PrimaryFlightDisplay's `warningOverlay` slot (see TelemetrySection.tsx), which
 * positions it as an overlay on the lower portion of the horizon circle rather than in normal
 * document flow - so it never pushes the rest of the page down when a problem appears or
 * clears, and never overlaps unrelated content below the PFD the way a full-width overlay
 * spanning past the PFD's own bounds would.
 */
export function VehicleHealthSection({ sensorHealth, messages }: VehicleHealthSectionProps) {
  const { t } = useTranslation();

  const unhealthySensors = sensorHealth
    ? SENSOR_ORDER.filter((bit) => (sensorHealth.present & bit) !== 0 && (sensorHealth.health & bit) === 0)
    : [];
  const prearmPresent = sensorHealth ? (sensorHealth.present & MavSysStatusSensor.PREARM_CHECK) !== 0 : false;
  const prearmFailing = prearmPresent && sensorHealth !== null && (sensorHealth.health & MavSysStatusSensor.PREARM_CHECK) === 0;
  const failureMessages = messages.filter((m) => isFailureSeverity(m.severity));

  if (!prearmFailing && unhealthySensors.length === 0 && failureMessages.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-card/95 p-1.5 text-xs shadow-md">
      {prearmFailing && (
        <span className="w-fit rounded-full bg-destructive px-2 py-0.5 font-bold tracking-wide text-destructive-foreground">
          {t("ardupilotSetup.health.prearmFailing")}
        </span>
      )}
      {unhealthySensors.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {unhealthySensors.map((bit) => {
            const hint = sensorHint(t, bit);
            const badgeClassName = "flex items-center gap-1 font-semibold text-destructive";
            // Every bit in SENSOR_ORDER has a real hint (see labels.ts's sensorHint) - the null
            // case is only a defensive fallback for a future/unrecognized sensor code, matching
            // sensorLabel's own "unknown" fallback pattern.
            if (!hint) {
              return (
                <li key={bit} className={badgeClassName}>
                  <CircleAlert className="h-3 w-3" aria-hidden="true" />
                  {sensorLabel(t, bit)}
                </li>
              );
            }
            return (
              <li key={bit}>
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <button type="button" className={`${badgeClassName} cursor-default`}>
                      <CircleAlert className="h-3 w-3" aria-hidden="true" />
                      {sensorLabel(t, bit)}
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-80 text-xs">
                    <p className="font-semibold text-destructive">{sensorLabel(t, bit)}</p>
                    <p className="mt-1.5 text-muted-foreground">{hint.cause}</p>
                    <p className="mt-1.5">{hint.fix}</p>
                  </HoverCardContent>
                </HoverCard>
              </li>
            );
          })}
        </ul>
      )}
      {failureMessages.map((message, i) => (
        <p key={i} className={messageClassName(message.severity)}>
          {message.text}
        </p>
      ))}
    </div>
  );
}
