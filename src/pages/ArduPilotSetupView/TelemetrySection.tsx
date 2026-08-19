import { useTranslation } from "react-i18next";
import { PrimaryFlightDisplay } from "../../components/PrimaryFlightDisplay/PrimaryFlightDisplay";
import { flightModeLabel, gpsFixTypeLabel } from "../../mavlink/labels/labels";
import type { StatusTextEntry } from "../../stores/mavlinkStatusTextStore/types";
import type {
  AttitudeTelemetry,
  BatteryTelemetry,
  GpsTelemetry,
  PositionTelemetry,
  SensorHealthTelemetry,
  VfrHudTelemetry,
} from "../../stores/mavlinkTelemetryStore/types";
import type { VehicleInfo } from "../../stores/mavlinkVehicleStore/types";
import type { ArduPilotSetupSection } from "./ArduPilotSetupSidebar";
import { LiveMapSection } from "./LiveMapSection";
import { OnboardingNudge } from "./OnboardingNudge";
import { VehicleHealthSection } from "./VehicleHealthSection";

interface TelemetrySectionProps {
  vehicle: VehicleInfo | null;
  attitude: AttitudeTelemetry | null;
  vfrHud: VfrHudTelemetry | null;
  battery: BatteryTelemetry | null;
  gps: GpsTelemetry | null;
  position: PositionTelemetry | null;
  sensorHealth: SensorHealthTelemetry | null;
  statusTextMessages: StatusTextEntry[];
  onNavigateToSection: (section: ArduPilotSetupSection) => void;
}

export function TelemetrySection({
  vehicle,
  attitude,
  vfrHud,
  battery,
  gps,
  position,
  sensorHealth,
  statusTextMessages,
  onNavigateToSection,
}: TelemetrySectionProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {vehicle && <OnboardingNudge onNavigate={onNavigateToSection} />}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,480px)_1fr]">
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          {!vehicle ? (
            <p className="text-xs text-muted-foreground">{t("ardupilotSetup.vehicle.waitingForHeartbeat")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <PrimaryFlightDisplay
                rollRad={attitude?.rollRad ?? null}
                pitchRad={attitude?.pitchRad ?? null}
                headingDeg={vfrHud?.headingDeg ?? null}
                airspeed={vfrHud?.airspeed ?? null}
                altitudeM={vfrHud?.altitudeM ?? null}
                armed={vehicle.armed}
                modeLabel={flightModeLabel(vehicle.type, vehicle.customMode)}
                warningOverlay={<VehicleHealthSection sensorHealth={sensorHealth} messages={statusTextMessages} />}
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

        <div className="min-h-0">
          <LiveMapSection position={position} headingDeg={vfrHud?.headingDeg} />
        </div>
      </div>
    </div>
  );
}
