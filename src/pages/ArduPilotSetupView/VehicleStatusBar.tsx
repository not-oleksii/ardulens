import { BatteryMedium, Satellite, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { COPTER_MODE_NAMES, PLANE_MODE_NAMES } from "../../constants";
import { flightModeLabel, gpsFixTypeLabel, mavAutopilotLabel, mavResultLabel, mavStateLabel, mavTypeLabel } from "../../mavlink/labels/labels";
import { GpsFixType, MavResult } from "../../mavlink/registry/registry";
import { vehicleFolderForMavType } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import type { BatteryTelemetry, GpsTelemetry } from "../../stores/mavlinkTelemetryStore/types";
import type { VehicleInfo } from "../../stores/mavlinkVehicleStore/types";

interface VehicleStatusBarProps {
  vehicle: VehicleInfo | null;
  battery: BatteryTelemetry | null;
  gps: GpsTelemetry | null;
  armCommandAck: { result: MavResult } | null;
  onArm: () => void;
  onDisarm: () => void;
  onSetMode: (customMode: number) => void;
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
 *
 * The armed badge and mode label double as controls - real GCS's (Mission Planner, QGC) keep
 * arm/mode always reachable from a persistent toolbar rather than burying them in a tab, and
 * this bar is already that persistent surface. Arming requires an explicit confirmation (motors
 * can spin immediately); disarming and mode changes don't - disarm is the safe direction when
 * landed (this app has no reliable "is it actually flying" signal to gate on), and a mode
 * change alone never starts a motor.
 */
export function VehicleStatusBar({ vehicle, battery, gps, armCommandAck, onArm, onDisarm, onSetMode }: VehicleStatusBarProps) {
  const { t } = useTranslation();
  const [confirmArmOpen, setConfirmArmOpen] = useState(false);
  if (!vehicle) return null;

  const isLowBattery = battery?.remainingPercent !== null && (battery?.remainingPercent ?? 100) < LOW_BATTERY_PERCENT;
  // Only Copter/Plane have a tabulated mode-name table (see constants.ts) - other vehicle
  // families fall back to the same read-only numeric label flightModeLabel already renders
  // elsewhere, rather than offering a dropdown of modes this app can't actually name.
  const vehicleFolder = vehicleFolderForMavType(vehicle.type);
  const modeNames = vehicleFolder === "ArduPlane" ? PLANE_MODE_NAMES : vehicleFolder === "ArduCopter" ? COPTER_MODE_NAMES : null;

  function handleArmBadgeClick() {
    if (vehicle!.armed) onDisarm();
    else setConfirmArmOpen(true);
  }

  function confirmArm() {
    setConfirmArmOpen(false);
    onArm();
  }

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border bg-muted/40 px-4 py-1.5 text-xs"
    >
      <Button
        type="button"
        size="sm"
        variant={vehicle.armed ? "destructive" : "default"}
        onClick={handleArmBadgeClick}
        className="h-6 px-2 text-xs font-bold tracking-wide"
      >
        {vehicle.armed ? t("ardupilotSetup.vehicle.disarm") : t("ardupilotSetup.vehicle.arm")}
      </Button>

      <span className="text-muted-foreground">{mavTypeLabel(t, vehicle.type)}</span>
      <span className="text-muted-foreground">{mavAutopilotLabel(t, vehicle.autopilot)}</span>
      <span className="text-muted-foreground">{mavStateLabel(t, vehicle.systemStatus)}</span>

      <span className="flex items-center gap-1">
        {vehicle.armed ? (
          <ShieldAlert className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        )}
        {modeNames ? (
          <select
            value={vehicle.customMode in modeNames ? vehicle.customMode : ""}
            onChange={(e) => onSetMode(Number(e.target.value))}
            aria-label={t("ardupilotSetup.vehicle.mode")}
            className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-xs font-semibold"
          >
            {/* The vehicle's actual current value always stays selectable, even if it's a
                mode number this app doesn't have a name for (matches MotorsCopterSection's
                frame class/type selects). */}
            {!(vehicle.customMode in modeNames) && <option value="">{vehicle.customMode}</option>}
            {Object.entries(modeNames).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-mono font-semibold">{flightModeLabel(vehicle.type, vehicle.customMode)}</span>
        )}
      </span>

      {armCommandAck && armCommandAck.result !== MavResult.ACCEPTED && (
        <span role="alert" className="font-semibold text-destructive">
          {t("ardupilotSetup.vehicle.armCommandRejected", { result: mavResultLabel(t, armCommandAck.result) })}
        </span>
      )}

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

      <Dialog open={confirmArmOpen} onOpenChange={setConfirmArmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.vehicle.confirmArmTitle")}</DialogTitle>
            <DialogDescription>{t("ardupilotSetup.vehicle.confirmArmDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmArmOpen(false)}>
              {t("ardupilotSetup.vehicle.cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={confirmArm}>
              {t("ardupilotSetup.vehicle.confirmArm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
