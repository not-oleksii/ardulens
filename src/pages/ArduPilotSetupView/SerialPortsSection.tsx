import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MavParamType, MavType } from "../../mavlink/registry/registry";
import { fetchParamDocs, vehicleFolderForMavType, type ParamDocsMap } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { ModifiedFromDefaultDot } from "./ModifiedFromDefaultDot";
import { ParamLoadProgress } from "./ParamLoadProgress";
import { SERIAL_PORT_INDICES, SERIAL_PORT_PARAM_NAMES, serialBaudParam, serialOptionsParam, serialProtocolParam } from "./serialPortsParams";

interface SerialPortsSectionProps {
  vehicleType: MavType;
  onLoad: () => void;
  onSetParam: (name: string, value: number, type: MavParamType) => void;
}

export function SerialPortsSection({ vehicleType, onLoad, onSetParam }: SerialPortsSectionProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const [docs, setDocs] = useState<ParamDocsMap | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [optionsPort, setOptionsPort] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const vehicleFolder = vehicleFolderForMavType(vehicleType);

  useEffect(() => {
    let cancelled = false;
    fetchParamDocs(vehicleFolder)
      .then((result) => {
        if (!cancelled) setDocs(result);
      })
      .catch(() => {
        // Enum/bitmask labels are a nice-to-have - the raw numeric codes still work without them.
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

  const hasAnyLoaded = SERIAL_PORT_PARAM_NAMES.some((name) => params[name] !== undefined);
  const pendingEntries = Object.entries(pendingChanges);
  const hasPendingChanges = pendingEntries.length > 0;

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

  function enumSelect(name: string) {
    const entry = params[name];
    if (!entry) return <span className="font-mono text-xs text-muted-foreground">-</span>;
    const value = shownValue(name)!;
    const values = docs?.[name]?.values;
    if (values) {
      return (
        <span className="flex items-center gap-1.5">
          <select
            className="w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={value}
            onChange={(e) => stageChange(name, Number(e.target.value))}
          >
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
    // No docs (offline, or the fetch just failed) - the raw code is still directly editable,
    // matching every other section's fallback (BatteryConfigSection, RC Setup's Failsafe list).
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
      <span className="flex items-center gap-1.5">
        <button type="button" className="font-mono text-xs hover:underline" onClick={() => startEdit(name, value)}>
          {value}
        </button>
        <ModifiedFromDefaultDot name={name} value={value} />
      </span>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.serialPorts.heading")}</h3>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onLoad}>
            {t("ardupilotSetup.serialPorts.load")}
          </Button>
          {hasPendingChanges && (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={handleResetAll}>
                {t("ardupilotSetup.serialPorts.reset")}
              </Button>
              <Button type="button" size="sm" onClick={() => setConfirmOpen(true)}>
                {t("ardupilotSetup.serialPorts.saveAll", { count: pendingEntries.length })}
              </Button>
            </>
          )}
        </div>
      </div>

      <Alert variant="warning" className="shrink-0">
        <AlertDescription>{t("ardupilotSetup.serialPorts.rebootRequiredWarning")}</AlertDescription>
      </Alert>

      <ParamLoadProgress />

      {!hasAnyLoaded ? (
        <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.serialPorts.notLoaded")}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ardupilotSetup.serialPorts.port")}</TableHead>
                <TableHead>{t("ardupilotSetup.serialPorts.protocol")}</TableHead>
                <TableHead>{t("ardupilotSetup.serialPorts.baud")}</TableHead>
                <TableHead>{t("ardupilotSetup.serialPorts.options")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SERIAL_PORT_INDICES.map((port) => {
                const protocolName = serialProtocolParam(port);
                const baudName = serialBaudParam(port);
                const optionsName = serialOptionsParam(port);
                // Docs' own humanName ("Telem1 protocol selection") minus the generic suffix, so
                // the row reads as "Telem1" - falls back to the raw param prefix if docs haven't
                // loaded, same as everywhere else in this app that shows a docs-driven label.
                const friendlyLabel = docs?.[protocolName]?.humanName?.replace(/ protocol selection$/, "");
                return (
                  <TableRow key={port}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-xs">{friendlyLabel ?? `Serial ${port}`}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">SERIAL{port}</span>
                      </div>
                    </TableCell>
                    <TableCell>{enumSelect(protocolName)}</TableCell>
                    <TableCell>{enumSelect(baudName)}</TableCell>
                    <TableCell>
                      {optionsName && params[optionsName] ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => setOptionsPort(port)}>
                          {t("ardupilotSetup.serialPorts.setOptions")}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={optionsPort !== null} onOpenChange={(open) => !open && setOptionsPort(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.serialPorts.optionsTitle", { port: optionsPort ?? 0 })}</DialogTitle>
          </DialogHeader>
          {optionsPort !== null &&
            (() => {
              const name = serialOptionsParam(optionsPort)!;
              const bits = docs?.[name]?.bitmask;
              const value = shownValue(name) ?? 0;
              if (!bits) {
                // No docs (offline, or the fetch just failed) - the raw bitmask value is still
                // directly editable, same fallback enumSelect uses above.
                return (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground">{t("ardupilotSetup.serialPorts.optionsUnavailable")}</p>
                    {editingName === name ? (
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
                      <button type="button" className="w-fit font-mono text-xs hover:underline" onClick={() => startEdit(name, value)}>
                        {value}
                      </button>
                    )}
                  </div>
                );
              }
              return (
                <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
                  {Object.entries(bits).map(([bit, bitLabel]) => {
                    const bitValue = 1 << Number(bit);
                    const checked = (value & bitValue) !== 0;
                    return (
                      <label key={bit} className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={checked} onChange={() => stageChange(name, value ^ bitValue)} />
                        {bitLabel}
                      </label>
                    );
                  })}
                </div>
              );
            })()}
          <DialogFooter>
            <Button type="button" onClick={() => setOptionsPort(null)}>
              {t("ardupilotSetup.serialPorts.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.serialPorts.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("ardupilotSetup.serialPorts.confirmDescription", { count: pendingEntries.length })}</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ardupilotSetup.parameters.name")}</TableHead>
                  <TableHead>{t("ardupilotSetup.serialPorts.from")}</TableHead>
                  <TableHead>{t("ardupilotSetup.serialPorts.to")}</TableHead>
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
              {t("ardupilotSetup.serialPorts.cancel")}
            </Button>
            <Button type="button" onClick={handleConfirmSaveAll}>
              {t("ardupilotSetup.serialPorts.confirmSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
