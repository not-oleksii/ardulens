import { useTranslation } from "react-i18next";
import { PrimaryFlightDisplay } from "../../components/PrimaryFlightDisplay/PrimaryFlightDisplay";
import { PLANE_MODE_NAMES } from "../../constants";
import { gpsFixTypeLabel, mavAutopilotLabel, mavStateLabel, mavTypeLabel } from "../../mavlink/labels/labels";
import { MavType } from "../../mavlink/registry/registry";
import type {
  AttitudeTelemetry,
  BatteryTelemetry,
  GpsTelemetry,
  PositionTelemetry,
  VfrHudTelemetry,
} from "../../stores/mavlinkTelemetryStore/types";
import type { VehicleInfo } from "../../stores/mavlinkVehicleStore/types";
import { LiveMapSection } from "./LiveMapSection";

interface TelemetrySectionProps {
  vehicle: VehicleInfo | null;
  attitude: AttitudeTelemetry | null;
  vfrHud: VfrHudTelemetry | null;
  battery: BatteryTelemetry | null;
  gps: GpsTelemetry | null;
  position: PositionTelemetry | null;
}

export function TelemetrySection({ vehicle, attitude, vfrHud, battery, gps, position }: TelemetrySectionProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,480px)_1fr]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.vehicle.heading")}</h3>
          {vehicle ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t("ardupilotSetup.vehicle.type")}</dt>
              <dd>{mavTypeLabel(t, vehicle.type)}</dd>
              <dt className="text-muted-foreground">{t("ardupilotSetup.vehicle.autopilot")}</dt>
              <dd>{mavAutopilotLabel(t, vehicle.autopilot)}</dd>
              <dt className="text-muted-foreground">{t("ardupilotSetup.vehicle.status")}</dt>
              <dd>{mavStateLabel(t, vehicle.systemStatus)}</dd>
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">{t("ardupilotSetup.vehicle.waitingForHeartbeat")}</p>
          )}
        </div>

        {vehicle && (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.telemetry.heading")}</h3>
            <PrimaryFlightDisplay
              rollRad={attitude?.rollRad ?? null}
              pitchRad={attitude?.pitchRad ?? null}
              headingDeg={vfrHud?.headingDeg ?? null}
              airspeed={vfrHud?.airspeed ?? null}
              altitudeM={vfrHud?.altitudeM ?? null}
              armed={vehicle.armed}
              modeLabel={
                vehicle.type === MavType.FIXED_WING
                  ? (PLANE_MODE_NAMES[vehicle.customMode] ?? String(vehicle.customMode))
                  : String(vehicle.customMode)
              }
            />
            {battery || gps || position ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.batteryVoltage")}</dt>
                <dd className="font-mono">{battery ? `${battery.voltageV.toFixed(2)} V` : "-"}</dd>
                <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.batteryCurrent")}</dt>
                <dd className="font-mono">
                  {battery && battery.currentA !== null ? `${battery.currentA.toFixed(1)} A` : "-"}
                </dd>
                <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.batteryRemaining")}</dt>
                <dd className="font-mono">
                  {battery && battery.remainingPercent !== null ? `${battery.remainingPercent}%` : "-"}
                </dd>
                <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.gpsFixLabel")}</dt>
                <dd>{gps ? gpsFixTypeLabel(t, gps.fixType) : "-"}</dd>
                <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.satellites")}</dt>
                <dd className="font-mono">{gps ? gps.satellitesVisible : "-"}</dd>
                <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.position")}</dt>
                <dd className="font-mono">{position ? `${position.lat.toFixed(6)}, ${position.lon.toFixed(6)}` : "-"}</dd>
              </dl>
            ) : (
              <p className="text-xs text-muted-foreground">{t("ardupilotSetup.telemetry.waitingForTelemetry")}</p>
            )}
          </div>
        )}
      </div>

      <div className="h-[560px]">
        <LiveMapSection position={position} headingDeg={vfrHud?.headingDeg} />
      </div>
    </div>
  );
}
