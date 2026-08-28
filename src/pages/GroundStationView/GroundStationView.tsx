import {
  ArrowLeft,
  Check,
  ChevronsLeft,
  ChevronsRight,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Radio,
  RadioTower,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DEVICE_PRESETS, defaultPresetFor, presetsFor } from "../../stores/groundStationSitesStore/presets";
import { useGroundStationSitesStore } from "../../stores/groundStationSitesStore/groundStationSitesStore";
import type { DeviceKind, Site, SiteDevice } from "../../stores/groundStationSitesStore/types";
import { useGroundStationMapViewer } from "./useGroundStationMapViewer";

interface DeviceContextMenuState {
  x: number;
  y: number;
  lat: number;
  lon: number;
}

function SitesPanel() {
  const { t } = useTranslation();
  const sites = useGroundStationSitesStore((s) => s.sites);
  const activeSiteId = useGroundStationSitesStore((s) => s.activeSiteId);
  const createSite = useGroundStationSitesStore((s) => s.createSite);
  const renameSite = useGroundStationSitesStore((s) => s.renameSite);
  const deleteSite = useGroundStationSitesStore((s) => s.deleteSite);
  const setActiveSite = useGroundStationSitesStore((s) => s.setActiveSite);

  const [newSiteOpen, setNewSiteOpen] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteSite, setConfirmDeleteSite] = useState<Site | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  function openNewSiteDialog() {
    setNewSiteName("");
    setNewSiteOpen(true);
  }

  function confirmNewSite() {
    const name = newSiteName.trim();
    if (!name) return;
    createSite(name);
    setNewSiteOpen(false);
  }

  function startRename(site: Site) {
    setEditingId(site.id);
    setEditingName(site.name);
  }

  function commitRename() {
    const name = editingName.trim();
    if (editingId && name) renameSite(editingId, name);
    setEditingId(null);
  }

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-3 border-r border-border p-3 transition-[width]",
        collapsed ? "w-12 items-center px-2" : "w-64",
      )}
    >
      <div className={cn("flex items-center gap-2", collapsed ? "flex-col" : "justify-between")}>
        {!collapsed && <h2 className="text-xs font-bold tracking-wide uppercase">{t("groundStation.sites.heading")}</h2>}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t(collapsed ? "sidebar.expand" : "sidebar.collapse")}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>
        {collapsed ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            title={t("groundStation.sites.new")}
            aria-label={t("groundStation.sites.new")}
            onClick={openNewSiteDialog}
          >
            <Plus className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={openNewSiteDialog}>
            <Plus className="h-4 w-4" />
            {t("groundStation.sites.new")}
          </Button>
        )}
      </div>

      {sites.length === 0 ? (
        !collapsed && <p className="text-xs text-muted-foreground">{t("groundStation.sites.empty")}</p>
      ) : (
        <ul className="flex w-full flex-col gap-1">
          {sites.map((site) => (
            <li key={site.id}>
              {editingId === site.id && !collapsed ? (
                <div className="flex items-center gap-1 rounded-md border border-border p-1">
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-7 flex-1 text-xs"
                  />
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={commitRename}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div
                  className={cn(
                    "group flex items-center gap-1 rounded-md p-1",
                    site.id === activeSiteId ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setActiveSite(site.id)}
                    title={collapsed ? site.name : undefined}
                    className={cn("flex flex-1 items-center gap-1.5 truncate text-left text-sm", collapsed && "justify-center")}
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {!collapsed && <span className="truncate">{site.name}</span>}
                  </button>
                  {!collapsed && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 shrink-0 p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => startRename(site)}
                        aria-label={t("groundStation.sites.rename")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 shrink-0 p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => setConfirmDeleteSite(site)}
                        aria-label={t("groundStation.sites.delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={newSiteOpen} onOpenChange={setNewSiteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("groundStation.sites.newDialogTitle")}</DialogTitle>
            <DialogDescription>{t("groundStation.sites.newDialogDescription")}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newSiteName}
            onChange={(e) => setNewSiteName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmNewSite()}
            placeholder={t("groundStation.sites.namePlaceholder")}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewSiteOpen(false)}>
              {t("groundStation.sites.cancel")}
            </Button>
            <Button type="button" onClick={confirmNewSite} disabled={!newSiteName.trim()}>
              {t("groundStation.sites.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteSite !== null} onOpenChange={(open) => !open && setConfirmDeleteSite(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("groundStation.sites.confirmDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("groundStation.sites.confirmDeleteDescription", { name: confirmDeleteSite?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDeleteSite(null)}>
              {t("groundStation.sites.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (confirmDeleteSite) deleteSite(confirmDeleteSite.id);
                setConfirmDeleteSite(null);
              }}
            >
              {t("groundStation.sites.confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface SiteMapProps {
  site: Site;
  selectedDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
  coverageDeviceIds: ReadonlySet<string>;
}

function SiteMap({ site, selectedDeviceId, onSelectDevice, coverageDeviceIds }: SiteMapProps) {
  const { t } = useTranslation();
  const [placingHome, setPlacingHome] = useState(false);
  const [contextMenu, setContextMenu] = useState<DeviceContextMenuState | null>(null);
  // Local, not lifted to GroundStationView - this component is remounted per site (`key=` in
  // the parent) already, so it naturally resets when switching sites without needing to be
  // told to, same as this file's other local per-site view state.
  const [showCombinedCoverage, setShowCombinedCoverage] = useState(false);
  const setHome = useGroundStationSitesStore((s) => s.setHome);
  const addDevice = useGroundStationSitesStore((s) => s.addDevice);
  const updateDevice = useGroundStationSitesStore((s) => s.updateDevice);

  const { containerRef, sampleAltitude, coverageLoadingIds, combinedCoverageLoading } = useGroundStationMapViewer({
    home: site.home,
    placingHome,
    onPlaceHome: (home) => {
      setHome(site.id, home);
      setPlacingHome(false);
    },
    devices: site.devices,
    selectedDeviceId,
    onSelectDevice,
    onDeviceMoved: (id, lat, lon, altitudeM) => updateDevice(site.id, id, { lat, lon, altitudeM }),
    // Same "any hand-edit clears presetId back to custom" convention as the property panel's own
    // patchField - dragging the rotation handle is just another way of hand-editing bearingDeg.
    onDeviceRotated: (id, bearingDeg) => updateDevice(site.id, id, { bearingDeg, presetId: null }),
    onMapRightClick: ({ screenX, screenY, lat, lon }) => setContextMenu({ x: screenX, y: screenY, lat, lon }),
    coverageDeviceIds,
    showCombinedCoverage,
  });

  // Closes the context menu on Escape or a click anywhere else - a right-click that opens a NEW
  // menu doesn't fire the DOM's own "click" event at all, so this doesn't fight that gesture.
  // Mirrors LiveMapSection's own right-click popup lifecycle exactly.
  useEffect(() => {
    if (!contextMenu) return;
    function close() {
      setContextMenu(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setContextMenu(null);
    }
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  async function handleAddDevice(kind: DeviceKind) {
    if (!contextMenu) return;
    const { lat, lon } = contextMenu;
    setContextMenu(null);
    const altitudeM = await sampleAltitude(lat, lon);
    const preset = defaultPresetFor(kind);
    // Reads the store directly rather than the `site` prop, which reflects the render this
    // closure was created from - placing two devices within the same terrain-sample round trip
    // (a real, not just theoretical, timing window) would otherwise have BOTH calls see the same
    // stale (pre-first-device) count and name themselves the same "Beacon 1"/"Antenna 1".
    const currentDevices = useGroundStationSitesStore.getState().sites.find((s) => s.id === site.id)?.devices ?? [];
    const index = currentDevices.filter((d) => d.kind === kind).length + 1;
    const id = addDevice(site.id, {
      kind,
      name: t(`groundStation.devices.defaultName.${kind}`, { index }),
      lat,
      lon,
      altitudeM,
      pattern: preset.pattern,
      rangeM: preset.rangeM,
      bearingDeg: 0,
      beamwidthDeg: preset.beamwidthDeg,
      presetId: preset.id,
    });
    onSelectDevice(id);
  }

  return (
    // onContextMenu is suppressed so a right-click opens this page's own "Add beacon/antenna
    // here" popup instead of the browser's native context menu - same convention as
    // LiveMapSection's own right-click popup.
    <div className="relative flex-1" onContextMenu={(e) => e.preventDefault()}>
      {/* h-full/w-full, not absolute+inset-0: MapLibre's own bundled CSS sets
          `.maplibregl-map { position: relative; }` on this div (unlayered, so it beats any
          Tailwind utility class regardless of specificity per CSS Cascade Layers rules) -
          fighting that with `absolute` left `inset-0` a no-op, collapsing this div to 0 height
          (width still filled, since a normal block element defaults to 100% of its parent's
          width regardless of position). Percentage sizing doesn't care which position value
          wins, so it works either way. */}
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-t-lg bg-card/90 px-3 py-2 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={placingHome ? "secondary" : "outline"} onClick={() => setPlacingHome((v) => !v)}>
            {t("groundStation.map.setHome")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={showCombinedCoverage ? "secondary" : "outline"}
            disabled={site.devices.length === 0}
            title={site.devices.length === 0 ? t("groundStation.devices.empty") : undefined}
            onClick={() => setShowCombinedCoverage((v) => !v)}
          >
            {showCombinedCoverage ? t("groundStation.devices.hideCombinedCoverage") : t("groundStation.devices.showCombinedCoverage")}
          </Button>
          {placingHome && <p className="text-xs text-muted-foreground">{t("groundStation.map.settingHomeHint")}</p>}
          {!site.home && !placingHome && <p className="text-xs text-muted-foreground">{t("groundStation.map.noHome")}</p>}
          <p className="text-xs text-muted-foreground">{t("groundStation.map.rightClickHint")}</p>
          {(coverageLoadingIds.size > 0 || combinedCoverageLoading) && (
            <p className="text-xs text-muted-foreground">{t("groundStation.devices.computingCoverage")}</p>
          )}
        </div>
        {site.home && (
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <span>
              {site.home.lat.toFixed(6)}, {site.home.lon.toFixed(6)}
            </span>
            <NumberField
              label={t("groundStation.map.homeAltitude")}
              displayValue={Math.round(site.home.altitudeM)}
              onCommit={(v) => setHome(site.id, { ...site.home!, altitudeM: v })}
            />
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="absolute z-20 flex flex-col overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="px-3 py-1.5 text-left text-xs whitespace-nowrap hover:bg-accent"
            onClick={() => void handleAddDevice("beacon")}
          >
            {t("groundStation.map.addBeaconHere")}
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-left text-xs whitespace-nowrap hover:bg-accent"
            onClick={() => void handleAddDevice("antenna")}
          >
            {t("groundStation.map.addAntennaHere")}
          </button>
        </div>
      )}
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  displayValue: number;
  onCommit: (value: number) => void;
}

/** A numeric field that commits on blur/Enter, not on every keystroke - unlike a plain
 *  controlled input wired straight to the store, this doesn't re-trigger this device's coverage
 *  raster (a real terrain-sampling batch, not free) after every single digit typed. Mirrors the
 *  Set-Home altitude field's own local-draft-then-commit pattern above. */
function NumberField({ label, displayValue, onCommit }: NumberFieldProps) {
  // null (not "") means "not currently editing, show the real value" - an empty STRING is a
  // real, valid mid-edit state (the user cleared the field to retype it from scratch), and
  // falling back to displayValue for that case - what `draft || displayValue` used to do - made
  // a cleared field immediately snap back to its old value, so the next keystroke appended onto
  // it instead of replacing it.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      {label}
      <Input
        type="number"
        value={draft ?? displayValue}
        onFocus={(e) => setDraft(e.target.value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const parsed = Number(draft);
          if (draft !== null && draft !== "" && Number.isFinite(parsed)) onCommit(parsed);
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="h-6 w-20 font-mono text-xs"
      />
    </label>
  );
}

interface DevicePropertiesProps {
  siteId: string;
  device: SiteDevice;
  showingCoverage: boolean;
  onToggleCoverage: () => void;
}

function DeviceProperties({ siteId, device, showingCoverage, onToggleCoverage }: DevicePropertiesProps) {
  const { t } = useTranslation();
  const updateDevice = useGroundStationSitesStore((s) => s.updateDevice);
  const presets = presetsFor(device.kind);

  function applyPreset(presetId: string) {
    const preset = DEVICE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    updateDevice(siteId, device.id, {
      pattern: preset.pattern,
      rangeM: preset.rangeM,
      beamwidthDeg: preset.beamwidthDeg,
      presetId: preset.id,
    });
  }

  // Any hand-edit clears presetId back to null - the property panel then shows this device as
  // custom-tuned rather than still matching a preset it no longer does.
  function patchField(patch: Partial<Pick<SiteDevice, "rangeM" | "bearingDeg" | "beamwidthDeg" | "altitudeM">>) {
    updateDevice(siteId, device.id, { ...patch, presetId: null });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t("groundStation.devices.preset")}</span>
        <Select value={device.presetId ?? undefined} onValueChange={applyPreset}>
          <SelectTrigger className="h-7 w-full text-xs">
            <SelectValue placeholder={t("groundStation.devices.customPreset")} />
          </SelectTrigger>
          <SelectContent>
            {presets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {t(preset.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <NumberField label={t("groundStation.devices.range")} displayValue={device.rangeM} onCommit={(v) => patchField({ rangeM: v })} />
      {device.pattern !== "omni" && (
        <NumberField
          label={t("groundStation.devices.bearing")}
          displayValue={device.bearingDeg}
          onCommit={(v) => patchField({ bearingDeg: v })}
        />
      )}
      {device.pattern === "directional" && (
        <NumberField
          label={t("groundStation.devices.beamwidth")}
          displayValue={device.beamwidthDeg}
          onCommit={(v) => patchField({ beamwidthDeg: v })}
        />
      )}
      <NumberField
        label={t("groundStation.devices.altitude")}
        displayValue={Math.round(device.altitudeM)}
        onCommit={(v) => patchField({ altitudeM: v })}
      />
      <Button type="button" size="sm" variant={showingCoverage ? "secondary" : "outline"} onClick={onToggleCoverage}>
        {showingCoverage ? t("groundStation.devices.hideCoverage") : t("groundStation.devices.showCoverage")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={device.locked ? "secondary" : "outline"}
        onClick={() => updateDevice(siteId, device.id, { locked: !device.locked })}
      >
        {device.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        {device.locked ? t("groundStation.devices.unlock") : t("groundStation.devices.lock")}
      </Button>
    </div>
  );
}

interface DevicesPanelProps {
  site: Site;
  selectedDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
  coverageDeviceIds: ReadonlySet<string>;
  onToggleCoverage: (id: string) => void;
}

function DevicesPanel({ site, selectedDeviceId, onSelectDevice, coverageDeviceIds, onToggleCoverage }: DevicesPanelProps) {
  const { t } = useTranslation();
  const renameDevice = useGroundStationSitesStore((s) => s.updateDevice);
  const removeDevice = useGroundStationSitesStore((s) => s.removeDevice);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteDevice, setConfirmDeleteDevice] = useState<SiteDevice | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const selectedDevice = site.devices.find((d) => d.id === selectedDeviceId) ?? null;

  function startRename(device: SiteDevice) {
    setEditingId(device.id);
    setEditingName(device.name);
  }

  function commitRename() {
    const name = editingName.trim();
    if (editingId && name) renameDevice(site.id, editingId, { name });
    setEditingId(null);
  }

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-3 transition-[width]",
        collapsed ? "w-12 items-center px-2" : "w-72",
      )}
    >
      <div className={cn("flex items-center gap-2", collapsed ? "flex-col" : "justify-between")}>
        {!collapsed && <h2 className="text-xs font-bold tracking-wide uppercase">{t("groundStation.devices.heading")}</h2>}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t(collapsed ? "sidebar.expand" : "sidebar.collapse")}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
        </Button>
      </div>

      {site.devices.length === 0 ? (
        !collapsed && <p className="text-xs text-muted-foreground">{t("groundStation.devices.empty")}</p>
      ) : (
        <ul className="flex w-full flex-col gap-1">
          {site.devices.map((device) => (
            <li key={device.id}>
              {editingId === device.id && !collapsed ? (
                <div className="flex items-center gap-1 rounded-md border border-border p-1">
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-7 flex-1 text-xs"
                  />
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={commitRename}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div
                  className={cn(
                    "group flex items-center gap-1 rounded-md p-1",
                    device.id === selectedDeviceId ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectDevice(device.id === selectedDeviceId ? null : device.id)}
                    title={collapsed ? device.name : undefined}
                    className={cn("flex flex-1 items-center gap-1.5 truncate text-left text-sm", collapsed && "justify-center")}
                  >
                    {device.kind === "beacon" ? (
                      <Radio className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <RadioTower className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    {!collapsed && <span className="truncate">{device.name}</span>}
                    {!collapsed && device.locked && (
                      <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={t("groundStation.devices.locked")} />
                    )}
                  </button>
                  {!collapsed && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 shrink-0 p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => startRename(device)}
                        aria-label={t("groundStation.devices.rename")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 shrink-0 p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => setConfirmDeleteDevice(device)}
                        aria-label={t("groundStation.devices.delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              )}
              {!collapsed && selectedDevice?.id === device.id && (
                <DeviceProperties
                  siteId={site.id}
                  device={device}
                  showingCoverage={coverageDeviceIds.has(device.id)}
                  onToggleCoverage={() => onToggleCoverage(device.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={confirmDeleteDevice !== null} onOpenChange={(open) => !open && setConfirmDeleteDevice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("groundStation.devices.confirmDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("groundStation.devices.confirmDeleteDescription", { name: confirmDeleteDevice?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDeleteDevice(null)}>
              {t("groundStation.sites.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (confirmDeleteDevice) {
                  removeDevice(site.id, confirmDeleteDevice.id);
                  if (selectedDeviceId === confirmDeleteDevice.id) onSelectDevice(null);
                  if (coverageDeviceIds.has(confirmDeleteDevice.id)) onToggleCoverage(confirmDeleteDevice.id);
                }
                setConfirmDeleteDevice(null);
              }}
            >
              {t("groundStation.devices.confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Pre-flight site planning: place a home position plus beacons/antennas on a real terrain
 * map, save the layout, and preview line-of-sight coverage - see the "Ground Station" plan.
 * Phase 3: a per-device line-of-sight coverage raster (green/yellow/red), toggled on from the
 * property panel and drawn as one ground-draped image per visible device - see
 * useGroundStationMapViewer's own doc comment for why it's one image, not one entity per cell.
 */
export function GroundStationView() {
  const { t } = useTranslation();
  const sites = useGroundStationSitesStore((s) => s.sites);
  const activeSiteId = useGroundStationSitesStore((s) => s.activeSiteId);
  const activeSite = sites.find((s) => s.id === activeSiteId) ?? null;
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [coverageDeviceIds, setCoverageDeviceIds] = useState<ReadonlySet<string>>(new Set());
  // A device selected/showing coverage in one site is meaningless once a different site becomes
  // active (or none does) - reset during render (React's own "adjusting state when a prop
  // changes" pattern, https://react.dev/learn/you-might-not-need-an-effect) rather than an
  // effect that would otherwise briefly render one extra frame with the stale selection applied.
  const [prevActiveSiteId, setPrevActiveSiteId] = useState(activeSiteId);
  if (activeSiteId !== prevActiveSiteId) {
    setPrevActiveSiteId(activeSiteId);
    setSelectedDeviceId(null);
    setCoverageDeviceIds(new Set());
  }

  function toggleCoverage(deviceId: string) {
    setCoverageDeviceIds((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <Link to="/" className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {t("groundStation.backToHome")}
        </Link>
        <h1 className="text-sm font-semibold">{t("groundStation.heading")}</h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <SitesPanel />
        <main className="flex flex-1 overflow-hidden">
          {activeSite ? (
            <>
              <SiteMap
                key={activeSite.id}
                site={activeSite}
                selectedDeviceId={selectedDeviceId}
                onSelectDevice={setSelectedDeviceId}
                coverageDeviceIds={coverageDeviceIds}
              />
              <DevicesPanel
                site={activeSite}
                selectedDeviceId={selectedDeviceId}
                onSelectDevice={setSelectedDeviceId}
                coverageDeviceIds={coverageDeviceIds}
                onToggleCoverage={toggleCoverage}
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <p className="max-w-sm text-center text-sm text-muted-foreground">{t("groundStation.emptyState")}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
