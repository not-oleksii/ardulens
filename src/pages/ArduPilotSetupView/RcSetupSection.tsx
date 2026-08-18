import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COPTER_MODE_NAMES, PLANE_MODE_NAMES } from "../../constants";
import type { MavParamType, MavType } from "../../mavlink/registry/registry";
import { fetchParamDocs, vehicleFolderForMavType, type ParamDocsMap } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { auxSwitchPos, FLTMODE_BAND_RANGE_LABELS, fltModeBandIndex } from "./rcBands";
import { colorForRcChannel } from "./rcChannelColors";
import { FLIGHT_MODE_SLOT_NAMES, RC_OPTION_CHANNEL_COUNT, RC_OPTION_PARAM_NAMES, RC_SETUP_PARAM_NAMES } from "./rcSetupParams";

interface RcSetupSectionProps {
  vehicleType: MavType;
  live: Record<number, number>;
  onLoad: () => void;
  onSetParam: (name: string, value: number, type: MavParamType) => void;
}

export function RcSetupSection({ vehicleType, live, onLoad, onSetParam }: RcSetupSectionProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const [docs, setDocs] = useState<ParamDocsMap | null>(null);
  const [requested, setRequested] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [pendingChanges, setPendingChanges] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const vehicleFolder = vehicleFolderForMavType(vehicleType);
  // Falls back to the same mode-number-name table the live PFD label uses, when the vehicle's
  // real docs.FLTMODEn.values hasn't loaded (offline, fetch failed) - Rover/Sub/Tracker have no
  // such table yet, so their mode dropdowns fall further back to the raw numeric editor.
  const modeNamesFallback = vehicleFolder === "ArduCopter" ? COPTER_MODE_NAMES : vehicleFolder === "ArduPlane" ? PLANE_MODE_NAMES : null;

  useEffect(() => {
    let cancelled = false;
    fetchParamDocs(vehicleFolder)
      .then((result) => {
        if (!cancelled) setDocs(result);
      })
      .catch(() => {
        // Enum labels are a nice-to-have - the raw numeric codes still work without them.
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleFolder]);

  function handleLoadClick() {
    setRequested(true);
    onLoad();
  }

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

  function stageChange(name: string, value: number) {
    const original = params[name]?.value;
    setPendingChanges((prev) => {
      const next = { ...prev };
      if (original !== undefined && value === original) {
        delete next[name];
      } else {
        next[name] = value;
      }
      return next;
    });
  }

  function handleResetAll() {
    setPendingChanges({});
  }

  function handleConfirmSaveAll() {
    for (const [name, value] of Object.entries(pendingChanges)) {
      const type = params[name]?.type;
      if (type !== undefined) onSetParam(name, value, type);
    }
    setPendingChanges({});
    setConfirmOpen(false);
  }

  const hasAnyLoaded = RC_SETUP_PARAM_NAMES.some((name) => params[name] !== undefined);
  const hasStarted = requested || hasAnyLoaded;
  const pendingEntries = Object.entries(pendingChanges);
  const hasPendingChanges = pendingEntries.length > 0;

  const fltModeChEntry = params.FLTMODE_CH;
  const fltModeChannel = fltModeChEntry ? (pendingChanges.FLTMODE_CH ?? fltModeChEntry.value) : null;
  const fltModeLivePwm = fltModeChannel !== null ? live[fltModeChannel] : undefined;
  const activeBandIndex = fltModeLivePwm !== undefined ? fltModeBandIndex(fltModeLivePwm) : null;

  function modeSelect(name: string, ownValues: Record<number, string> | undefined) {
    const entry = params[name];
    if (!entry) {
      return <span className="font-mono text-xs text-muted-foreground">-</span>;
    }
    const shownValue = pendingChanges[name] ?? entry.value;
    const values = ownValues ?? modeNamesFallback ?? undefined;
    if (values) {
      return (
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
      );
    }
    return editingName === name ? (
      <Input
        autoFocus
        value={editingValue}
        onChange={(e) => setEditingValue(e.target.value)}
        onBlur={() => commitEdit(name)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitEdit(name);
          if (e.key === "Escape") setEditingName(null);
        }}
        className="h-7 w-24"
      />
    ) : (
      <button type="button" className="font-mono text-xs hover:underline" onClick={() => startEdit(name, shownValue)}>
        {shownValue}
      </button>
    );
  }

  function optionSelect(name: string) {
    const entry = params[name];
    if (!entry) return <span className="font-mono text-xs text-muted-foreground">-</span>;
    const shownValue = pendingChanges[name] ?? entry.value;
    const values = docs?.[name]?.values;
    if (values) {
      return (
        <select
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
          value={shownValue}
          onChange={(e) => stageChange(name, Number(e.target.value))}
        >
          {Object.entries(values).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      );
    }
    return editingName === name ? (
      <Input
        autoFocus
        value={editingValue}
        onChange={(e) => setEditingValue(e.target.value)}
        onBlur={() => commitEdit(name)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitEdit(name);
          if (e.key === "Escape") setEditingName(null);
        }}
        className="h-7 w-24"
      />
    ) : (
      <button type="button" className="font-mono text-xs hover:underline" onClick={() => startEdit(name, shownValue)}>
        {shownValue}
      </button>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.rcSetup.heading")}</h3>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={handleLoadClick}>
            {t("ardupilotSetup.rcSetup.load")}
          </Button>
          {hasPendingChanges && (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={handleResetAll}>
                {t("ardupilotSetup.rcSetup.reset")}
              </Button>
              <Button type="button" size="sm" onClick={() => setConfirmOpen(true)}>
                {t("ardupilotSetup.rcSetup.saveAll", { count: pendingEntries.length })}
              </Button>
            </>
          )}
        </div>
      </div>

      {!hasStarted ? (
        <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.rcSetup.notLoaded")}</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
          <section className="flex flex-col gap-2">
            <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">{t("ardupilotSetup.rcSetup.flightModesHeading")}</h4>
            <label className="flex items-center gap-2 text-xs">
              <span className="font-bold tracking-wide uppercase">{t("ardupilotSetup.rcSetup.fltmodeChannel")}</span>
              {fltModeChEntry ? (
                <select
                  className="rounded-md border border-border bg-background px-2 py-1"
                  value={fltModeChannel ?? 5}
                  onChange={(e) => stageChange("FLTMODE_CH", Number(e.target.value))}
                >
                  {Array.from({ length: RC_OPTION_CHANNEL_COUNT }, (_, i) => i + 1).map((ch) => (
                    <option key={ch} value={ch}>
                      {ch}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
              {fltModeLivePwm !== undefined && (
                <span className="font-mono text-muted-foreground">{fltModeLivePwm} us</span>
              )}
            </label>

            <div className="flex flex-col gap-1 rounded-lg border border-border p-2">
              {FLIGHT_MODE_SLOT_NAMES.map((name, i) => {
                const isActive = activeBandIndex === i;
                return (
                  <div
                    key={name}
                    className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs ${isActive ? "bg-primary/15" : ""}`}
                  >
                    <span className="font-mono text-muted-foreground">{FLTMODE_BAND_RANGE_LABELS[i]} us</span>
                    {modeSelect(name, docs?.[name]?.values ?? docs?.FLTMODE1?.values)}
                    {isActive && <span className="text-primary">{t("ardupilotSetup.rcSetup.active")}</span>}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col gap-2">
            <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">{t("ardupilotSetup.rcSetup.optionsHeading")}</h4>
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-2">
              {RC_OPTION_PARAM_NAMES.map((name, i) => {
                const channel = i + 1;
                const color = colorForRcChannel(channel);
                const pwm = live[channel];
                const pos = pwm !== undefined ? auxSwitchPos(pwm) : null;
                return (
                  <div key={name} className="flex items-center gap-2 text-xs">
                    <span className="flex w-6 shrink-0 items-center gap-1 font-mono" style={{ color }}>
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                      {channel}
                    </span>
                    <span className="w-14 shrink-0 font-mono text-muted-foreground">{pwm !== undefined ? `${pwm} us` : "-"}</span>
                    <span className="w-14 shrink-0 text-muted-foreground">{pos ? t(`ardupilotSetup.rcSetup.pos.${pos}`) : "-"}</span>
                    {optionSelect(name)}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.rcSetup.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("ardupilotSetup.rcSetup.confirmDescription", { count: pendingEntries.length })}</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ardupilotSetup.parameters.name")}</TableHead>
                  <TableHead>{t("ardupilotSetup.rcSetup.from")}</TableHead>
                  <TableHead>{t("ardupilotSetup.rcSetup.to")}</TableHead>
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
              {t("ardupilotSetup.rcSetup.cancel")}
            </Button>
            <Button type="button" onClick={handleConfirmSaveAll}>
              {t("ardupilotSetup.rcSetup.confirmSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
