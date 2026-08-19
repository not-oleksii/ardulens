import { BatteryMedium, Satellite, ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { flightModeLabel, gpsFixTypeLabel } from "../../mavlink/labels/labels";
import { GpsFixType } from "../../mavlink/registry/registry";
import type { BatteryTelemetry, GpsTelemetry } from "../../stores/mavlinkTelemetryStore/types";
import type { VehicleInfo } from "../../stores/mavlinkVehicleStore/types";

interface VehicleStatusBarProps {
  vehicle: VehicleInfo | null;
  battery: BatteryTelemetry | null;
  gps: GpsTelemetry | null;
}

// Matches the low-battery threshold most GCS/OSDs treat as "land now" territory - just enough
// to color the readout, not a hard gate on anything.
const LOW_BATTERY_PERCENT = 20;

/**
 * A slim, always-visible strip (armed state, flight mode, battery, GPS fix) shown regardless of
 * which sidebar section is active - unlike TelemetrySection's full dashboard, which only exists
 * on the Telemetry tab, this is what keeps arm state and voltage in view while testing motors,
 * calibrating RC, etc. (see the UX audit that prompted this: neither is otherwise visible once
 * you navigate away from Telemetry, which is exactly the moment it matters most).
 */
export function VehicleStatusBar({ vehicle, battery, gps }: VehicleStatusBarProps) {
  const { t } = useTranslation();
  if (!vehicle) return null;

  const isLowBattery = battery?.remainingPercent !== null && (battery?.remainingPercent ?? 100) < LOW_BATTERY_PERCENT;

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border bg-muted/40 px-4 py-1.5 text-xs"
    >
      <span
        className={cn(
          "flex items-center gap-1 rounded-full px-2 py-0.5 font-bold tracking-wide",
          vehicle.armed ? "bg-destructive text-destructive-foreground" : "bg-primary/15 text-primary",
        )}
      >
        {vehicle.armed ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        {vehicle.armed ? t("ardupilotSetup.vehicle.armed") : t("ardupilotSetup.vehicle.disarmed")}
      </span>

      <span className="font-mono font-semibold">{flightModeLabel(vehicle.type, vehicle.customMode)}</span>

      <span
        className={cn("flex items-center gap-1 font-mono", isLowBattery ? "text-destructive" : "text-muted-foreground")}
        title={t("ardupilotSetup.telemetry.batteryVoltage")}
      >
        <BatteryMedium className="h-3.5 w-3.5" aria-hidden="true" />
        {battery ? (
          <>
            {battery.voltageV.toFixed(2)} V
            {battery.remainingPercent !== null && ` (${battery.remainingPercent}%)`}
          </>
        ) : (
          "-"
        )}
      </span>

      <span className="flex items-center gap-1 font-mono text-muted-foreground" title={t("ardupilotSetup.telemetry.gpsFixLabel")}>
        <Satellite className="h-3.5 w-3.5" aria-hidden="true" />
        {gps ? `${gpsFixTypeLabel(t, gps.fixType)} (${gps.satellitesVisible})` : gpsFixTypeLabel(t, GpsFixType.NO_GPS)}
      </span>
    </div>
  );
}
