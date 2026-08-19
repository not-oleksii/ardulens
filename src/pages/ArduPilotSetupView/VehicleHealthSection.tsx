import { CircleAlert, CircleCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { sensorLabel } from "../../mavlink/labels/labels";
import { MavSeverity, MavSysStatusSensor } from "../../mavlink/registry/registry";
import type { StatusTextEntry } from "../../stores/mavlinkStatusTextStore/types";
import type { SensorHealthTelemetry } from "../../stores/mavlinkTelemetryStore/types";

interface VehicleHealthSectionProps {
  sensorHealth: SensorHealthTelemetry | null;
  messages: StatusTextEntry[];
}

// Display order, not a completeness requirement - only bits actually PRESENT on this vehicle
// get rendered (see the filter below), so most vehicles only ever show a handful of these.
// PREARM_CHECK is handled separately below as its own "checks passing/failing" badge, not a
// physical sensor in this list - it's ArduPilot's own summary bit for "would an arm attempt
// succeed right now."
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

// EMERGENCY(0)..ERROR(3): a real problem. WARNING(4)/NOTICE(5): worth reading, not a fault.
// INFO(6)/DEBUG(7): routine chatter, dimmed so it doesn't compete with the above.
function severityClassName(severity: MavSeverity): string {
  if (severity <= MavSeverity.ERROR) return "text-destructive font-semibold";
  if (severity <= MavSeverity.NOTICE) return "text-amber-700 dark:text-amber-400";
  return "text-muted-foreground";
}

/**
 * "Why won't it arm" - ArduPilot's SYS_STATUS sensor-health bits (which present sensors are
 * currently unhealthy, plus its own PREARM_CHECK summary bit) and recent STATUSTEXT messages
 * (the only place ArduPilot's actual human-readable prearm-failure reasons appear, e.g.
 * "PreArm: Compass not calibrated" - a rejected arm COMMAND_ACK only ever carries a generic
 * MAV_RESULT code, see VehicleStatusBar.tsx's own armCommandRejected message). Renders nothing
 * until either kind of data has actually arrived.
 */
export function VehicleHealthSection({ sensorHealth, messages }: VehicleHealthSectionProps) {
  const { t } = useTranslation();
  if (!sensorHealth && messages.length === 0) return null;

  const presentSensors = sensorHealth ? SENSOR_ORDER.filter((bit) => (sensorHealth.present & bit) !== 0) : [];
  const prearmPresent = sensorHealth ? (sensorHealth.present & MavSysStatusSensor.PREARM_CHECK) !== 0 : false;
  const prearmHealthy = sensorHealth ? (sensorHealth.health & MavSysStatusSensor.PREARM_CHECK) !== 0 : false;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.health.heading")}</h3>

      {prearmPresent && (
        <span
          className={cn(
            "w-fit rounded-full px-2 py-0.5 text-xs font-bold tracking-wide",
            prearmHealthy ? "bg-primary/15 text-primary" : "bg-destructive text-destructive-foreground",
          )}
        >
          {prearmHealthy ? t("ardupilotSetup.health.prearmOk") : t("ardupilotSetup.health.prearmFailing")}
        </span>
      )}

      {presentSensors.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {presentSensors.map((bit) => {
            const healthy = (sensorHealth!.health & bit) !== 0;
            return (
              <li key={bit} className={cn("flex items-center gap-1", healthy ? "text-muted-foreground" : "font-semibold text-destructive")}>
                {healthy ? <CircleCheck className="h-3 w-3" aria-hidden="true" /> : <CircleAlert className="h-3 w-3" aria-hidden="true" />}
                {sensorLabel(t, bit)}
              </li>
            );
          })}
        </ul>
      )}

      {messages.length > 0 && (
        <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-2 font-mono text-xs">
          {messages.map((message, i) => (
            <p key={i} className={severityClassName(message.severity)}>
              {message.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
