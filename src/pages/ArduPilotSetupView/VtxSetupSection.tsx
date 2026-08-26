import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from "@/components/ui/table";
import type { MavParamType, MavType } from "../../mavlink/registry/registry";
import { fetchParamDocs, vehicleFolderForMavType, type ParamDocsMap } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { ModifiedFromDefaultDot } from "./ModifiedFromDefaultDot";
import { ParamLoadProgress } from "./ParamLoadProgress";
import { VTX_BAND_FALLBACK_VALUES, VTX_ENABLE_FALLBACK_VALUES, VTX_OPTIONS_BITS, VTX_PARAM_NAMES, VTX_TYPES_BITS } from "./vtxSetupParams";

interface VtxSetupSectionProps {
  vehicleType: MavType;
  onLoad: () => void;
  onSetParam: (name: string, value: number, type: MavParamType) => void;
}

export function VtxSetupSection({ vehicleType, onLoad, onSetParam }: VtxSetupSectionProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const [docs, setDocs] = useState<ParamDocsMap | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const vehicleFolder = vehicleFolderForMavType(vehicleType);

  useEffect(() => {
    let cancelled = false;
    fetchParamDocs(vehicleFolder)
      .then((result) => {
        if (!cancelled) setDocs(result);
      })
      .catch(() => {
        // Enum labels (VTX_ENABLE/VTX_BAND) are a nice-to-have - the hardcoded fallback below
        // still works without them, same pattern OsdSetupSection uses.
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleFolder]);

  function shownValue(name: string): number | undefined {
    return pendingChanges[name] ?? params[name]?.value;
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

  const hasAnyLoaded = VTX_PARAM_NAMES.some((name) => params[name] !== undefined);
  const pendingEntries = Object.entries(pendingChanges);
  const hasPendingChanges = pendingEntries.length > 0;

  function numberField(name: string, unit?: string) {
    const entry = params[name];
    if (!entry) return <span className="font-mono text-xs text-muted-foreground">-</span>;
    const value = shownValue(name)!;
    return (
      <span className="flex items-center gap-1.5">
        <Input
          type="number"
          value={value}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (Number.isFinite(parsed)) stageChange(name, parsed);
          }}
          className="h-7 w-24 text-xs"
        />
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        <ModifiedFromDefaultDot name={name} value={value} />
      </span>
    );
  }

  function enumField(name: string, fallbackValues: Record<number, string>) {
    const entry = params[name];
    const values = docs?.[name]?.values ?? fallbackValues;
    if (!entry) return <span className="font-mono text-xs text-muted-foreground">-</span>;
    const value = shownValue(name)!;
    return (
      <span className="flex items-center gap-1.5">
        <select
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          value={value}
          onChange={(e) => stageChange(name, Number(e.target.value))}
        >
          {/* The vehicle's actual current value always stays selectable, even if it's a code
              this reference enum doesn't have a label for - same fallback pattern
              OsdSetupSection/VehicleStatusBar's mode select use. */}
          {!(value in values) && <option value={value}>{value}</option>}
          {Object.entries(values).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <ModifiedFromDefaultDot name={name} value={value} />
      </span>
    );
  }

  function bitmaskTable(name: string, bits: { bit: number; labelKey: string }[]) {
    const entry = params[name];
    if (!entry) return <p className="text-xs text-muted-foreground">-</p>;
    const value = shownValue(name)!;
    return (
      <div className="flex flex-col gap-1">
        {bits.map(({ bit, labelKey }) => {
          const mask = 1 << bit;
          const checked = (value & mask) !== 0;
          return (
            <label key={bit} className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={checked} onChange={() => stageChange(name, value ^ mask)} />
              {t(`ardupilotSetup.vtxSetup.options.${labelKey}`)}
            </label>
          );
        })}
        <span className="flex items-center gap-1">
          <ModifiedFromDefaultDot name={name} value={value} />
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.vtxSetup.heading")}</h3>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onLoad}>
            {t("ardupilotSetup.vtxSetup.load")}
          </Button>
          {hasPendingChanges && (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={handleResetAll}>
                {t("ardupilotSetup.vtxSetup.reset")}
              </Button>
              <Button type="button" size="sm" onClick={() => setConfirmOpen(true)}>
                {t("ardupilotSetup.vtxSetup.saveAll", { count: pendingEntries.length })}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* A compatibility caveat (which hardware even responds to these settings), not a warning
          about consequences of a specific action - info, not warning, so it doesn't visually
          compete with unlockedWarning's own real regulatory caution below once params load. */}
      <Alert variant="info" className="shrink-0">
        <AlertDescription>{t("ardupilotSetup.vtxSetup.supportDisclaimer")}</AlertDescription>
      </Alert>

      <ParamLoadProgress />

      {!hasAnyLoaded ? (
        <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.vtxSetup.notLoaded")}</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.vtxSetup.description")}</p>

          <Alert variant="warning" className="shrink-0">
            <AlertDescription>{t("ardupilotSetup.vtxSetup.unlockedWarning")}</AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">{t("ardupilotSetup.vtxSetup.enable")}</span>
              {enumField("VTX_ENABLE", VTX_ENABLE_FALLBACK_VALUES)}
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">{t("ardupilotSetup.vtxSetup.band")}</span>
              {enumField("VTX_BAND", VTX_BAND_FALLBACK_VALUES)}
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">{t("ardupilotSetup.vtxSetup.channel")}</span>
              {numberField("VTX_CHANNEL")}
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">{t("ardupilotSetup.vtxSetup.power")}</span>
              {numberField("VTX_POWER", "mW")}
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">{t("ardupilotSetup.vtxSetup.maxPower")}</span>
              {numberField("VTX_MAX_POWER", "mW")}
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground" title={t("ardupilotSetup.vtxSetup.freqHint")}>
                {t("ardupilotSetup.vtxSetup.freq")}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {params.VTX_FREQ ? `${params.VTX_FREQ.value} MHz` : "-"}
              </span>
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ardupilotSetup.vtxSetup.optionsHeading")}</TableHead>
                  <TableHead>{t("ardupilotSetup.vtxSetup.typesHeading")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="align-top">{bitmaskTable("VTX_OPTIONS", VTX_OPTIONS_BITS)}</TableCell>
                  <TableCell className="align-top">{bitmaskTable("VTX_TYPES", VTX_TYPES_BITS)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.vtxSetup.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("ardupilotSetup.vtxSetup.confirmDescription", { count: pendingEntries.length })}</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ardupilotSetup.parameters.name")}</TableHead>
                  <TableHead>{t("ardupilotSetup.vtxSetup.from")}</TableHead>
                  <TableHead>{t("ardupilotSetup.vtxSetup.to")}</TableHead>
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
              {t("ardupilotSetup.vtxSetup.cancel")}
            </Button>
            <Button type="button" onClick={handleConfirmSaveAll}>
              {t("ardupilotSetup.vtxSetup.confirmSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
