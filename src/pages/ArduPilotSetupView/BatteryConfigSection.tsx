import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { MavParamType, MavType } from "../../mavlink/registry/registry";
import { vehicleFolderForMavType } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import type { BatteryTelemetry } from "../../stores/mavlinkTelemetryStore/types";
import { BATTERY_ENUM_PARAMS, BATTERY_PARAM_NAMES } from "./batteryParams";
import { ModifiedFromDefaultDot } from "./ModifiedFromDefaultDot";
import { ParamLoadProgress } from "./ParamLoadProgress";
import { useParamDocs } from "./useParamDocs";
import { useStagedParamChanges } from "./useStagedParamChanges";

interface BatteryConfigSectionProps {
  vehicleType: MavType;
  battery: BatteryTelemetry | null;
  onLoad: () => void;
  onSetParam: (name: string, value: number, type: MavParamType) => void;
}

export function BatteryConfigSection({ vehicleType, battery, onLoad, onSetParam }: BatteryConfigSectionProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const vehicleFolder = vehicleFolderForMavType(vehicleType);
  // Enum labels are a nice-to-have - the raw numeric codes still work without them.
  const { docs } = useParamDocs(vehicleFolder);
  const {
    pendingChanges,
    pendingEntries,
    hasPendingChanges,
    confirmOpen,
    setConfirmOpen,
    stageChange,
    resetAll: handleResetAll,
    confirmSaveAll: handleConfirmSaveAll,
  } = useStagedParamChanges({ params, onSetParam });

  function startEdit(name: string, currentValue: number) {
    setEditingName(name);
    setEditingValue(String(currentValue));
  }

  function commitEdit(name: string) {
    setEditingName(null);
    const parsed = Number(editingValue);
    if (!Number.isFinite(parsed)) return;
    stageChange(name, parsed);
  }

  const hasAnyLoaded = BATTERY_PARAM_NAMES.some((name) => params[name] !== undefined);

  function renderField(name: string) {
    const entry = params[name];
    if (!entry) {
      return (
        <div key={name} className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-muted-foreground">{name}</span>
          <span className="text-xs text-muted-foreground">-</span>
        </div>
      );
    }
    const isModified = pendingChanges[name] !== undefined;
    const shownValue = pendingChanges[name] ?? entry.value;
    const values = docs?.[name]?.values;

    return (
      <div key={name} className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs">{name}</span>
        <span className="flex items-center gap-1.5">
          {BATTERY_ENUM_PARAMS.has(name) && values ? (
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              value={shownValue}
              onChange={(e) => stageChange(name, Number(e.target.value))}
            >
              {Object.entries(values).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          ) : editingName === name ? (
            <Input
              autoFocus
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={() => commitEdit(name)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit(name);
                if (e.key === "Escape") setEditingName(null);
              }}
              className="h-7 w-28"
            />
          ) : (
            <button
              type="button"
              className={isModified ? "font-mono text-xs text-primary hover:underline" : "font-mono text-xs hover:underline"}
              onClick={() => startEdit(name, shownValue)}
            >
              {shownValue}
            </button>
          )}
          <ModifiedFromDefaultDot name={name} value={shownValue} />
        </span>
      </div>
    );
  }

  return (
    // h-full only once the param list has actually loaded and needs the space - otherwise
    // this is just a heading/toolbar, a 3-column battery readout, and one status line.
    <div className={cn("flex flex-col gap-3", hasAnyLoaded && "h-full")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.batteryConfig.heading")}</h3>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onLoad}>
            {t("ardupilotSetup.batteryConfig.load")}
          </Button>
          {hasPendingChanges && (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={handleResetAll}>
                {t("ardupilotSetup.batteryConfig.reset")}
              </Button>
              <Button type="button" size="sm" onClick={() => setConfirmOpen(true)}>
                {t("ardupilotSetup.batteryConfig.saveAll", { count: pendingEntries.length })}
              </Button>
            </>
          )}
        </div>
      </div>

      <dl className="grid shrink-0 grid-cols-3 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.batteryVoltage")}</dt>
        <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.batteryCurrent")}</dt>
        <dt className="text-muted-foreground">{t("ardupilotSetup.telemetry.batteryRemaining")}</dt>
        <dd className="font-mono">{battery ? `${battery.voltageV.toFixed(2)} V` : "-"}</dd>
        <dd className="font-mono">{battery && battery.currentA !== null ? `${battery.currentA.toFixed(1)} A` : "-"}</dd>
        <dd className="font-mono">{battery && battery.remainingPercent !== null ? `${battery.remainingPercent}%` : "-"}</dd>
      </dl>

      <ParamLoadProgress />

      {!hasAnyLoaded ? (
        <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.batteryConfig.notLoaded")}</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border border-border p-3">
          {BATTERY_PARAM_NAMES.map((name) => renderField(name))}
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.batteryConfig.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("ardupilotSetup.batteryConfig.confirmDescription", { count: pendingEntries.length })}</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ardupilotSetup.parameters.name")}</TableHead>
                  <TableHead>{t("ardupilotSetup.batteryConfig.from")}</TableHead>
                  <TableHead>{t("ardupilotSetup.batteryConfig.to")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingEntries.map(([name, value]) => (
                  <TableRow key={name}>
                    <TableCell className="font-mono">{name}</TableCell>
                    <TableCell className="font-mono">{params[name]?.value}</TableCell>
                    <TableCell className="font-mono">{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("ardupilotSetup.batteryConfig.cancel")}
            </Button>
            <Button type="button" onClick={handleConfirmSaveAll}>
              {t("ardupilotSetup.batteryConfig.confirmSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
