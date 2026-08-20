import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MavParamType, MavType } from "../../mavlink/registry/registry";
import { vehicleFolderForMavType } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useFileStore } from "../../stores/fileStore/fileStore";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { useUiStore } from "../../stores/uiStore/uiStore";
import { ComingSoonSection } from "./ComingSoonSection";
import { ModifiedFromDefaultDot } from "./ModifiedFromDefaultDot";
import { ParamLoadProgress } from "./ParamLoadProgress";
import { pidConfigForVehicleFolder, type PidAxis } from "./pidGroups";

interface PidTuneSectionProps {
  vehicleType: MavType;
  onLoad: () => void;
  onSetParam: (name: string, value: number, type: MavParamType) => void;
}

// Only these axes have a matching desired-vs-actual rate preset in raw-log/presets.ts (RATE.*,
// ArduCopter/Sub's rate-controller dataflash message) - Plane's rate-loop logging and Rover's
// steering/speed axes don't, so those axes just don't get a "View in Graphs" button.
const AXIS_PRESET_KEYS: Partial<Record<PidAxis["key"], string>> = {
  roll: "pidRoll",
  pitch: "pidPitch",
  yaw: "pidYaw",
};

export function PidTuneSection({ vehicleType, onLoad, onSetParam }: PidTuneSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const file = useFileStore((s) => s.file);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const setPendingPresetKey = useUiStore((s) => s.setPendingPresetKey);
  const params = useMavlinkParameterStore((s) => s.params);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  // Same stage-then-confirm pattern as ParametersPanel - a PID change takes effect immediately
  // on the vehicle once sent, so it's worth a deliberate "Save all" review rather than writing
  // on every keystroke.
  const [pendingChanges, setPendingChanges] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const vehicleFolder = vehicleFolderForMavType(vehicleType);
  const config = pidConfigForVehicleFolder(vehicleFolder);
  // Only ArduCopter/Sub log the RATE dataflash message (RDes/R etc.) the pidRoll/pidPitch/
  // pidYaw presets look for (see pidGroups.ts's own comment on why Copter and Sub share this
  // naming) - Plane's rate-loop logging uses different message/field names entirely, so its
  // roll/pitch/yaw axes don't get a deep-link button that would just resolve to nothing.
  const supportsRatePresets = vehicleFolder === "ArduCopter" || vehicleFolder === "ArduSub";

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

  // Deep-links to the currently loaded flight log's Graphs page, with the matching
  // desired-vs-actual rate preset pre-selected - the log-viewer route ("/") and this live-GCS
  // route ("/ardupilot-setup") don't share React Router state, so the hand-off goes through
  // uiStore's pendingPresetKey, consumed and cleared by GraphsView on mount.
  function openAxisInGraphs(presetKey: string) {
    setPendingPresetKey(presetKey);
    setActiveTab("graphs");
    void navigate("/");
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
  const pendingEntries = Object.entries(pendingChanges);
  const hasPendingChanges = pendingEntries.length > 0;

  function renderAxis(axis: PidAxis) {
    const presetKey = supportsRatePresets ? AXIS_PRESET_KEYS[axis.key] : undefined;
    return (
      <div key={axis.key} className="flex min-w-48 flex-1 flex-col gap-2 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">{t(`ardupilotSetup.pidTune.${axis.key}`)}</h4>
          {presetKey && file && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px]"
              onClick={() => openAxisInGraphs(presetKey)}
            >
              {t("ardupilotSetup.pidTune.viewInGraphs")}
            </Button>
          )}
        </div>
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
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className={isModified ? "font-mono text-xs text-primary hover:underline" : "font-mono text-xs hover:underline"}
                    onClick={() => startEdit(resolvedName, shownValue)}
                  >
                    {shownValue}
                  </button>
                  <ModifiedFromDefaultDot name={resolvedName} value={shownValue} />
                </span>
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
          <Button type="button" size="sm" variant="outline" onClick={onLoad}>
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

      <ParamLoadProgress />

      {!hasAnyResolved ? (
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
