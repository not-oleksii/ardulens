import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MavParamType, MavType } from "../../mavlink/registry/registry";
import { vehicleFolderForMavType } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { ComingSoonSection } from "./ComingSoonSection";
import { pidConfigForVehicleFolder, type PidAxis } from "./pidGroups";

interface PidTuneSectionProps {
  vehicleType: MavType;
  onLoad: () => void;
  onSetParam: (name: string, value: number, type: MavParamType) => void;
}

export function PidTuneSection({ vehicleType, onLoad, onSetParam }: PidTuneSectionProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const [requested, setRequested] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  // Same stage-then-confirm pattern as ParametersPanel - a PID change takes effect immediately
  // on the vehicle once sent, so it's worth a deliberate "Save all" review rather than writing
  // on every keystroke.
  const [pendingChanges, setPendingChanges] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const config = pidConfigForVehicleFolder(vehicleFolderForMavType(vehicleType));

  function startEdit(name: string, currentValue: number) {
    setEditingName(name);
    setEditingValue(String(currentValue));
  }

  function commitEdit(name: string) {
    setEditingName(null);
    const parsed = Number(editingValue);
    if (!Number.isFinite(parsed)) return;
    const original = params[name]?.value;
    setPendingChanges((prev) => {
      const next = { ...prev };
      if (original !== undefined && parsed === original) {
        delete next[name];
      } else {
        next[name] = parsed;
      }
      return next;
    });
  }

  function handleLoadClick() {
    setRequested(true);
    onLoad();
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

  if (!config) {
    return <ComingSoonSection heading={t("ardupilotSetup.pidTune.heading")} description={t("ardupilotSetup.comingSoon.pidTune")} />;
  }

  // A term is "resolved" once one of its candidate param names (see pidGroups.ts - Plane's
  // gains can live under either its modern or legacy naming scheme) has actually arrived from
  // the vehicle - which also covers the case where the full parameter list was already loaded
  // elsewhere (this section just reads the same shared store, nothing PID-specific about it).
  function resolveTerm(candidates: readonly string[]): string | null {
    return candidates.find((name) => params[name] !== undefined) ?? null;
  }

  const hasAnyResolved = config.axes.some((axis) => axis.terms.some((term) => resolveTerm(term.candidates) !== null));
  const hasStarted = requested || hasAnyResolved;
  const pendingEntries = Object.entries(pendingChanges);
  const hasPendingChanges = pendingEntries.length > 0;

  function renderAxis(axis: PidAxis) {
    return (
      <div key={axis.key} className="flex min-w-48 flex-1 flex-col gap-2 rounded-lg border border-border p-3">
        <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">{t(`ardupilotSetup.pidTune.${axis.key}`)}</h4>
        {axis.terms.map((term) => {
          const resolvedName = resolveTerm(term.candidates);
          if (!resolvedName) {
            return (
              <div key={term.label} className="flex items-center justify-between gap-2" title={t("ardupilotSetup.pidTune.unavailableTerm")}>
                <span className="font-mono text-xs text-muted-foreground">{term.label}</span>
                <span className="text-xs text-muted-foreground">-</span>
              </div>
            );
          }
          const entry = params[resolvedName]!;
          const isModified = pendingChanges[resolvedName] !== undefined;
          const shownValue = pendingChanges[resolvedName] ?? entry.value;
          return (
            <div key={term.label} className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs">{term.label}</span>
              {editingName === resolvedName ? (
                <Input
                  autoFocus
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={() => commitEdit(resolvedName)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit(resolvedName);
                    if (e.key === "Escape") setEditingName(null);
                  }}
                  className="h-7 w-28"
                />
              ) : (
                <button
                  type="button"
                  className={isModified ? "font-mono text-xs text-primary hover:underline" : "font-mono text-xs hover:underline"}
                  onClick={() => startEdit(resolvedName, shownValue)}
                >
                  {shownValue}
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.pidTune.heading")}</h3>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={handleLoadClick}>
            {t("ardupilotSetup.pidTune.load")}
          </Button>
          {hasPendingChanges && (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={handleResetAll}>
                {t("ardupilotSetup.pidTune.reset")}
              </Button>
              <Button type="button" size="sm" onClick={() => setConfirmOpen(true)}>
                {t("ardupilotSetup.pidTune.saveAll", { count: pendingEntries.length })}
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.pidTune.description")}</p>

      {!hasStarted ? (
        <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.pidTune.notLoaded")}</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-wrap gap-4 overflow-y-auto">{config.axes.map((axis) => renderAxis(axis))}</div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.pidTune.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("ardupilotSetup.pidTune.confirmDescription", { count: pendingEntries.length })}</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ardupilotSetup.parameters.name")}</TableHead>
                  <TableHead>{t("ardupilotSetup.pidTune.from")}</TableHead>
                  <TableHead>{t("ardupilotSetup.pidTune.to")}</TableHead>
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
              {t("ardupilotSetup.pidTune.cancel")}
            </Button>
            <Button type="button" onClick={handleConfirmSaveAll}>
              {t("ardupilotSetup.pidTune.confirmSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
