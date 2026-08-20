import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { MavParamType, MavType } from "../../mavlink/registry/registry";
import { fetchParamDocs, vehicleFolderForMavType, type ParamDocsMap } from "../../services/ardupilotParamDocs/ardupilotParamDocs";
import { useMavlinkParameterStore } from "../../stores/mavlinkParameterStore/mavlinkParameterStore";
import { ModifiedFromDefaultDot } from "./ModifiedFromDefaultDot";
import { ParamLoadProgress } from "./ParamLoadProgress";
import {
  ALIGNMENT_ANCHORS,
  alignmentAnchorLabel,
  alignmentPosition,
  allOsdParamNames,
  clampOsdX,
  clampOsdY,
  OSD_CHAN_FALLBACK_VALUES,
  OSD_ELEMENT_KEYS,
  OSD_GRID_COLS,
  OSD_GRID_ROWS,
  OSD_SCREEN_NUMBERS,
  OSD_TYPE_FALLBACK_VALUES,
  OSD_UNITS_FALLBACK_VALUES,
  osdElementLabel,
  osdElementParamName,
  osdPresetLabel,
  OSD_PRESETS,
  osdScreenControlParamNames,
  osdVisibleSafeArea,
  resolveOsdPreset,
  type OsdElementKey,
  type OsdPreset,
  type OsdScreenNumber,
} from "./osdSetupParams";
import { OsdScreenLayout } from "./OsdScreenLayout";

interface OsdSetupSectionProps {
  vehicleType: MavType;
  onLoad: () => void;
  onSetParam: (name: string, value: number, type: MavParamType) => void;
}

export function OsdSetupSection({ vehicleType, onLoad, onSetParam }: OsdSetupSectionProps) {
  const { t } = useTranslation();
  const params = useMavlinkParameterStore((s) => s.params);
  const [docs, setDocs] = useState<ParamDocsMap | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeScreen, setActiveScreen] = useState<OsdScreenNumber>(1);
  const [elementFilter, setElementFilter] = useState("");
  const [selectedElementKey, setSelectedElementKey] = useState<OsdElementKey | null>(null);

  const vehicleFolder = vehicleFolderForMavType(vehicleType);

  useEffect(() => {
    let cancelled = false;
    fetchParamDocs(vehicleFolder)
      .then((result) => {
        if (!cancelled) setDocs(result);
      })
      .catch(() => {
        // Enum labels (OSD_TYPE/OSD_UNITS) are a nice-to-have - the raw numeric codes still
        // work without them, same fallback RcSetupSection/BatteryConfigSection use.
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

  const hasAnyLoaded = allOsdParamNames().some((name) => params[name] !== undefined);
  const pendingEntries = Object.entries(pendingChanges);
  const hasPendingChanges = pendingEntries.length > 0;

  function numberField(name: string) {
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
          className="h-7 w-20 text-xs"
        />
        <ModifiedFromDefaultDot name={name} value={value} />
      </span>
    );
  }

  function enumField(name: string, fallbackValues?: Record<number, string>) {
    const entry = params[name];
    const values = docs?.[name]?.values ?? fallbackValues;
    if (!entry) return <span className="font-mono text-xs text-muted-foreground">-</span>;
    const value = shownValue(name)!;
    if (!values) return numberField(name);
    return (
      <span className="flex items-center gap-1.5">
        <select
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          value={value}
          onChange={(e) => stageChange(name, Number(e.target.value))}
        >
          {/* The vehicle's actual current value always stays selectable, even if it's a code
              this reference enum doesn't have a label for (e.g. a newer firmware fork that
              added values beyond ArduCopter's own reference docs) - same fallback
              VehicleStatusBar's flight-mode select uses. */}
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

  const filteredElements = OSD_ELEMENT_KEYS.filter((key) =>
    osdElementLabel(t, key).toLowerCase().includes(elementFilter.toLowerCase()),
  );

  const [enableParam, chanMinParam, chanMaxParam] = osdScreenControlParamNames(activeScreen);
  const screenEnableEntry = params[enableParam];

  // Drives OsdScreenLayout's draggable chips - every element on this screen that's both loaded
  // and currently enabled (staged or saved), at its live (possibly staged) X/Y.
  const layoutElements = OSD_ELEMENT_KEYS.flatMap((key) => {
    const enName = osdElementParamName(activeScreen, key, "EN");
    const xName = osdElementParamName(activeScreen, key, "X");
    const yName = osdElementParamName(activeScreen, key, "Y");
    if (!params[enName] || !params[xName] || !params[yName]) return [];
    if (shownValue(enName) === 0) return [];
    return [{ key, x: shownValue(xName)!, y: shownValue(yName)! }];
  });

  function handleMoveElement(key: OsdElementKey, x: number, y: number) {
    stageChange(osdElementParamName(activeScreen, key, "X"), x);
    stageChange(osdElementParamName(activeScreen, key, "Y"), y);
  }

  const selectedXName = selectedElementKey ? osdElementParamName(activeScreen, selectedElementKey, "X") : null;
  const selectedYName = selectedElementKey ? osdElementParamName(activeScreen, selectedElementKey, "Y") : null;
  const canQuickPosition = !!selectedXName && !!selectedYName && !!params[selectedXName] && !!params[selectedYName];

  // Shared by Quick Position and presets - both need to snap within the real visible area (see
  // OsdScreenLayout's own safe-area overlay) rather than the full 60x22 parameter range, or
  // "top right"/a preset's edge elements could land past what this OSD_TYPE/TXT_RES combination
  // can actually display.
  const activeScreenBounds = osdVisibleSafeArea(shownValue("OSD_TYPE"), shownValue(`OSD${activeScreen}_TXT_RES`)) ?? {
    cols: OSD_GRID_COLS,
    rows: OSD_GRID_ROWS,
  };

  function handleQuickPosition(anchor: (typeof ALIGNMENT_ANCHORS)[number]) {
    if (!selectedXName || !selectedYName || !selectedElementKey) return;
    const bounds = activeScreenBounds;
    const { x, y: anchoredY } = alignmentPosition(anchor, bounds);
    const y = findFreeStackedY(x, anchoredY, bounds);
    stageChange(selectedXName, clampOsdX(x));
    stageChange(selectedYName, clampOsdY(y));
  }

  // If another currently-enabled element on this screen already sits at the anchor's exact
  // (x, y), stacks the new one below it instead of landing exactly on top and becoming
  // unclickable on the canvas (a real report: two elements quick-positioned to the same corner
  // made the one underneath impossible to drag). Tries downward first (reads top-to-bottom,
  // matching how a stack of labels in the same corner naturally grows), then upward if the
  // column's already full going down, then gives up and returns the original position (still
  // reachable and editable via the table/keyboard even if visually overlapping).
  function findFreeStackedY(x: number, y: number, bounds: { cols: number; rows: number }): number {
    const occupied = new Set(
      layoutElements.filter((el) => el.key !== selectedElementKey && el.x === x).map((el) => el.y),
    );
    if (!occupied.has(y)) return y;
    for (let candidate = y + 1; candidate <= bounds.rows - 1; candidate++) {
      if (!occupied.has(candidate)) return candidate;
    }
    for (let candidate = y - 1; candidate >= 0; candidate--) {
      if (!occupied.has(candidate)) return candidate;
    }
    return y;
  }

  // Applying a preset replaces the active screen's whole layout, not just adds to it - every
  // other element not in the preset gets disabled, so the result reads as "this is the layout"
  // rather than a partial overlay on whatever was there before. Like every other edit in this
  // section, this only stages changes (see pendingChanges/handleConfirmSaveAll) - nothing is
  // actually sent to the vehicle until the user reviews and confirms Save All, so a preset can
  // be tried and discarded via Reset with no risk.
  function handleApplyPreset(preset: OsdPreset) {
    const resolved = resolveOsdPreset(preset, activeScreenBounds);
    const includedKeys = new Set(resolved.map((r) => r.key));
    for (const key of OSD_ELEMENT_KEYS) {
      if (includedKeys.has(key)) continue;
      const enName = osdElementParamName(activeScreen, key, "EN");
      if (!params[enName]) continue; // can't stage what hasn't loaded from the vehicle yet
      if (shownValue(enName) !== 0) stageChange(enName, 0);
    }
    for (const { key, x, y } of resolved) {
      const enName = osdElementParamName(activeScreen, key, "EN");
      const xName = osdElementParamName(activeScreen, key, "X");
      const yName = osdElementParamName(activeScreen, key, "Y");
      if (!params[enName] || !params[xName] || !params[yName]) continue;
      stageChange(enName, 1);
      stageChange(xName, x);
      stageChange(yName, y);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide uppercase">{t("ardupilotSetup.osdSetup.heading")}</h3>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onLoad}>
            {t("ardupilotSetup.osdSetup.load")}
          </Button>
          {hasPendingChanges && (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={handleResetAll}>
                {t("ardupilotSetup.osdSetup.reset")}
              </Button>
              <Button type="button" size="sm" onClick={() => setConfirmOpen(true)}>
                {t("ardupilotSetup.osdSetup.saveAll", { count: pendingEntries.length })}
              </Button>
            </>
          )}
        </div>
      </div>

      <ParamLoadProgress />

      {!hasAnyLoaded ? (
        <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.osdSetup.notLoaded")}</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.osdSetup.description")}</p>

          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-2 text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t("ardupilotSetup.osdSetup.osdType")}</span>
              {enumField("OSD_TYPE", OSD_TYPE_FALLBACK_VALUES)}
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t("ardupilotSetup.osdSetup.osdUnits")}</span>
              {enumField("OSD_UNITS", OSD_UNITS_FALLBACK_VALUES)}
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t("ardupilotSetup.osdSetup.osdChan")}</span>
              {enumField("OSD_CHAN", OSD_CHAN_FALLBACK_VALUES)}
            </label>
          </div>

          <div className="flex shrink-0 gap-1 border-b border-border">
            {OSD_SCREEN_NUMBERS.map((screen) => (
              <button
                key={screen}
                type="button"
                onClick={() => setActiveScreen(screen)}
                className={cn(
                  "rounded-t-md px-3 py-1.5 text-xs font-semibold",
                  activeScreen === screen ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {t("ardupilotSetup.osdSetup.screenTab", { screen })}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={screenEnableEntry ? shownValue(enableParam) !== 0 : false}
                disabled={!screenEnableEntry}
                onChange={(e) => stageChange(enableParam, e.target.checked ? 1 : 0)}
              />
              {t("ardupilotSetup.osdSetup.screenEnable")}
              {screenEnableEntry && <ModifiedFromDefaultDot name={enableParam} value={shownValue(enableParam)!} />}
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t("ardupilotSetup.osdSetup.screenChanMin")}</span>
              {numberField(chanMinParam)}
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t("ardupilotSetup.osdSetup.screenChanMax")}</span>
              {numberField(chanMaxParam)}
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">{t("ardupilotSetup.osdSetup.presetsHeading")}</span>
            {OSD_PRESETS.map((preset) => (
              <Button key={preset.id} type="button" size="sm" variant="outline" onClick={() => handleApplyPreset(preset)}>
                {osdPresetLabel(t, preset.id)}
              </Button>
            ))}
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
            <div className="flex min-h-0 flex-col gap-2">
              <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
                {t("ardupilotSetup.osdSetup.elementsHeading")}
              </h4>
              <Input
                value={elementFilter}
                onChange={(e) => setElementFilter(e.target.value)}
                placeholder={t("ardupilotSetup.osdSetup.elementSearchPlaceholder")}
                className="h-7 shrink-0 text-xs"
              />

              {/* Just Element + Enabled (no X/Y columns) - a Betaflight-style flat checkbox
                  list, narrow enough to never need a horizontal scrollbar in this column's
                  fixed 280-360px width. Position is set by dragging on the canvas or via the
                  Quick Position panel to the right, not by typing coordinates in this list. */}
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("ardupilotSetup.osdSetup.elementColumn")}</TableHead>
                      <TableHead>{t("ardupilotSetup.osdSetup.enabledColumn")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredElements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-xs text-muted-foreground">
                          {t("ardupilotSetup.osdSetup.noMatches")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredElements.map((key) => {
                        const enName = osdElementParamName(activeScreen, key, "EN");
                        const enEntry = params[enName];
                        return (
                          <TableRow
                            key={key}
                            onClick={() => setSelectedElementKey(key)}
                            className={cn("cursor-pointer", selectedElementKey === key && "bg-accent")}
                          >
                            <TableCell className="text-xs">{osdElementLabel(t, key)}</TableCell>
                            <TableCell>
                              <span className="flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={enEntry ? shownValue(enName) !== 0 : false}
                                  disabled={!enEntry}
                                  onChange={(e) => stageChange(enName, e.target.checked ? 1 : 0)}
                                />
                                {enEntry && <ModifiedFromDefaultDot name={enName} value={shownValue(enName)!} />}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
              <h4 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
                {t("ardupilotSetup.osdSetup.visualLayout")}
              </h4>
              <OsdScreenLayout
                elements={layoutElements}
                selectedKey={selectedElementKey}
                onSelect={setSelectedElementKey}
                onMove={handleMoveElement}
                osdType={shownValue("OSD_TYPE")}
                txtRes={shownValue(`OSD${activeScreen}_TXT_RES`)}
              />
              <p className="shrink-0 text-xs text-muted-foreground">{t("ardupilotSetup.osdSetup.dragHint")}</p>

              <div className="flex shrink-0 flex-wrap items-start gap-3 rounded-lg border border-border p-2">
                <h5 className="w-full text-xs font-bold tracking-wide uppercase text-muted-foreground">
                  {t("ardupilotSetup.osdSetup.quickPosition")}
                </h5>
                {!selectedElementKey ? (
                  <p className="text-xs text-muted-foreground">{t("ardupilotSetup.osdSetup.selectElementHint")}</p>
                ) : (
                  <>
                    <div className="grid w-32 grid-cols-3 gap-1">
                      {ALIGNMENT_ANCHORS.map((anchor) => (
                        <button
                          key={anchor}
                          type="button"
                          disabled={!canQuickPosition}
                          onClick={() => handleQuickPosition(anchor)}
                          title={alignmentAnchorLabel(t, anchor)}
                          aria-label={alignmentAnchorLabel(t, anchor)}
                          className="flex aspect-square items-center justify-center rounded-md border border-border hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span
                            className={cn("h-1.5 w-1.5 rounded-full bg-foreground", anchor === "center" && "bg-primary")}
                          />
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-semibold">{osdElementLabel(t, selectedElementKey)}</p>
                      {canQuickPosition ? (
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            {t("ardupilotSetup.osdSetup.xColumn")}
                            {numberField(selectedXName)}
                          </label>
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            {t("ardupilotSetup.osdSetup.yColumn")}
                            {numberField(selectedYName)}
                          </label>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">{t("ardupilotSetup.osdSetup.elementNotLoaded")}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ardupilotSetup.osdSetup.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("ardupilotSetup.osdSetup.confirmDescription", { count: pendingEntries.length })}</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ardupilotSetup.parameters.name")}</TableHead>
                  <TableHead>{t("ardupilotSetup.osdSetup.from")}</TableHead>
                  <TableHead>{t("ardupilotSetup.osdSetup.to")}</TableHead>
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
              {t("ardupilotSetup.osdSetup.cancel")}
            </Button>
            <Button type="button" onClick={handleConfirmSaveAll}>
              {t("ardupilotSetup.osdSetup.confirmSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
