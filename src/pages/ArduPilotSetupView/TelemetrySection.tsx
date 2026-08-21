import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PrimaryFlightDisplay } from "../../components/PrimaryFlightDisplay/PrimaryFlightDisplay";
import { flightModeLabel, gpsFixTypeLabel } from "../../mavlink/labels/labels";
import { MavSeverity } from "../../mavlink/registry/registry";
import type { StatusTextEntry } from "../../stores/mavlinkStatusTextStore/types";
import type {
  AttitudeTelemetry,
  BatteryTelemetry,
  EkfTelemetry,
  GpsTelemetry,
  PositionTelemetry,
  SensorHealthTelemetry,
  VfrHudTelemetry,
  VibrationTelemetry,
} from "../../stores/mavlinkTelemetryStore/types";
import type { VehicleInfo } from "../../stores/mavlinkVehicleStore/types";
import { fmtTimeHms } from "../../utils/format/format";
import type { ArduPilotSetupSection } from "./ArduPilotSetupSidebar";
import { LiveMapSection } from "./LiveMapSection";
import { OnboardingNudge } from "./OnboardingNudge";
import { PreflightChecklistSection } from "./PreflightChecklistSection";
import { VehicleHealthSection } from "./VehicleHealthSection";

// Colors every severity (not just failures - contrast VehicleHealthSection.tsx's own, simpler
// version, which only ever sees pre-filtered WARNING+ messages) for the compact Messages tab below.
function messageClassName(severity: MavSeverity): string {
  if (severity <= MavSeverity.ERROR) return "text-destructive font-semibold"; // EMERGENCY/ALERT/CRITICAL/ERROR
  if (severity === MavSeverity.WARNING) return "text-amber-700 dark:text-amber-400";
  if (severity === MavSeverity.NOTICE) return "text-blue-700 dark:text-blue-400";
  return "text-muted-foreground"; // INFO/DEBUG - routine chatter
}

// ArduPilot's own documented vibration guidance (see the wiki's "Measuring Vibration" page):
// below 30 m/s/s is fine, 30-60 is marginal, above 60 is bad enough to affect EKF/altitude
// estimates - not an arbitrary UI-picked threshold.
function vibrationClassName(maxAxis: number): string {
  if (maxAxis >= 60) return "text-destructive font-semibold";
  if (maxAxis >= 30) return "text-amber-700 dark:text-amber-400";
  return "";
}

// EKF_STATUS_REPORT's variances are normalized so ~1.0 is AP_NavEKF's own "degraded estimate"
// boundary (see EkfTelemetry's own doc comment) - reusing that same boundary here rather than
// picking a new one.
function ekfVarianceClassName(maxVariance: number): string {
  if (maxVariance >= 1) return "text-destructive font-semibold";
  if (maxVariance >= 0.5) return "text-amber-700 dark:text-amber-400";
  return "";
}

interface TelemetrySectionProps {
  vehicle: VehicleInfo | null;
  attitude: AttitudeTelemetry | null;
  vfrHud: VfrHudTelemetry | null;
  battery: BatteryTelemetry | null;
  gps: GpsTelemetry | null;
  gps2: GpsTelemetry | null;
  position: PositionTelemetry | null;
  sensorHealth: SensorHealthTelemetry | null;
  ekf: EkfTelemetry | null;
  vibration: VibrationTelemetry | null;
  statusTextMessages: StatusTextEntry[];
  onNavigateToSection: (section: ArduPilotSetupSection) => void;
}

export function TelemetrySection({
  vehicle,
  attitude,
  vfrHud,
  battery,
  gps,
  gps2,
  position,
  sensorHealth,
  ekf,
  vibration,
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
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <PrimaryFlightDisplay
                rollRad={attitude?.rollRad ?? null}
                pitchRad={attitude?.pitchRad ?? null}
                headingDeg={vfrHud?.headingDeg ?? null}
                airspeed={vfrHud?.airspeed ?? null}
                altitudeM={vfrHud?.altitudeM ?? null}
                armed={vehicle.armed}
                modeLabel={flightModeLabel(vehicle.type, vehicle.customMode)}
                warningOverlay={<VehicleHealthSection sensorHealth={sensorHealth} />}
              />
              {/* min-h-0 flex-1 down through Tabs/TabsContent/the list itself - so Messages and
                  PreFlight's scrollable lists fill the rest of this column down to its bottom
                  edge instead of stopping at an arbitrary fixed height with a cramped scrollbar
                  while the rest of the column sits empty. */}
              <Tabs defaultValue="stats" className="flex min-h-0 flex-1 flex-col">
                <TabsList>
                  <TabsTrigger value="stats">{t("ardupilotSetup.telemetry.statsTab")}</TabsTrigger>
                  <TabsTrigger value="messages">{t("ardupilotSetup.telemetry.messagesTab")}</TabsTrigger>
                  <TabsTrigger value="preflight">{t("ardupilotSetup.telemetry.preflightTab")}</TabsTrigger>
                </TabsList>
                <TabsContent value="stats">
                  {battery || gps || gps2 || position || ekf || vibration ? (
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
                      <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.groundspeed")}</dt>
                      <dd className="font-mono">{vfrHud ? `${vfrHud.groundspeed.toFixed(1)} m/s` : "-"}</dd>
                      <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.gpsFixLabel")}</dt>
                      <dd>{gps ? gpsFixTypeLabel(t, gps.fixType) : "-"}</dd>
                      <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.satellites")}</dt>
                      <dd className="font-mono">{gps ? gps.satellitesVisible : "-"}</dd>
                      {/* GPS2 rows only appear once a GPS2_RAW packet has actually arrived - most
                          vehicles only have one GPS receiver, so this stays absent rather than
                          showing a permanent "no second GPS" placeholder. */}
                      {gps2 && (
                        <>
                          <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.gps2FixLabel")}</dt>
                          <dd>{gpsFixTypeLabel(t, gps2.fixType)}</dd>
                          <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.satellites2")}</dt>
                          <dd className="font-mono">{gps2.satellitesVisible}</dd>
                        </>
                      )}
                      <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.position")}</dt>
                      <dd className="font-mono">{position ? `${position.lat.toFixed(6)}, ${position.lon.toFixed(6)}` : "-"}</dd>
                      {/* Vibration/EKF variance rows only appear once the vehicle actually sends
                          VIBRATION/EKF_STATUS_REPORT - not every ArduPilot build streams these by
                          default, so a permanent "-" placeholder would be misleading. */}
                      {vibration && (
                        <>
                          <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.vibration")}</dt>
                          <dd className={`font-mono ${vibrationClassName(Math.max(vibration.x, vibration.y, vibration.z))}`}>
                            {vibration.x.toFixed(1)} / {vibration.y.toFixed(1)} / {vibration.z.toFixed(1)} m/s²
                          </dd>
                        </>
                      )}
                      {vibration && (vibration.clippingX > 0 || vibration.clippingY > 0 || vibration.clippingZ > 0) && (
                        <>
                          <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.vibrationClipping")}</dt>
                          <dd className="font-mono text-destructive font-semibold">
                            {vibration.clippingX} / {vibration.clippingY} / {vibration.clippingZ}
                          </dd>
                        </>
                      )}
                      {ekf && (
                        <>
                          <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.ekfVariance")}</dt>
                          <dd
                            className={`font-mono ${ekfVarianceClassName(
                              Math.max(ekf.velocityVariance, ekf.posHorizVariance, ekf.posVertVariance, ekf.compassVariance),
                            )}`}
                          >
                            {Math.max(ekf.velocityVariance, ekf.posHorizVariance, ekf.posVertVariance, ekf.compassVariance).toFixed(2)}
                          </dd>
                        </>
                      )}
                    </dl>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("ardupilotSetup.telemetry.waitingForTelemetry")}</p>
                  )}
                </TabsContent>
                <TabsContent value="messages" className="flex min-h-0 flex-1 flex-col">
                  {statusTextMessages.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("ardupilotSetup.messages.empty")}</p>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto font-mono text-xs">
                      {statusTextMessages.map((message, i) => (
                        <p key={i} className={messageClassName(message.severity)}>
                          <span className="text-muted-foreground">{fmtTimeHms(message.receivedAt)}</span> {message.text}
                        </p>
                      ))}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="preflight" className="flex min-h-0 flex-1 flex-col">
                  <PreflightChecklistSection sensorHealth={sensorHealth} />
                </TabsContent>
              </Tabs>
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
