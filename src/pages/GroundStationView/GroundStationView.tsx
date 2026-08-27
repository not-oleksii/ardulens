import { ArrowLeft, Check, MapPin, Pencil, Plus, Radio, RadioTower, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CESIUM_TOKEN_STORAGE_KEY } from "../../constants";
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
    <div className="flex w-64 shrink-0 flex-col gap-3 border-r border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold tracking-wide uppercase">{t("groundStation.sites.heading")}</h2>
        <Button type="button" size="sm" variant="outline" onClick={openNewSiteDialog}>
          <Plus className="h-4 w-4" />
          {t("groundStation.sites.new")}
        </Button>
      </div>

      {sites.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("groundStation.sites.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {sites.map((site) => (
            <li key={site.id}>
              {editingId === site.id ? (
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
                  className={`group flex items-center gap-1 rounded-md p-1 ${site.id === activeSiteId ? "bg-accent" : "hover:bg-accent/50"}`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveSite(site.id)}
                    className="flex flex-1 items-center gap-1.5 truncate text-left text-sm"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{site.name}</span>
                  </button>
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
}

function SiteMap({ site, selectedDeviceId, onSelectDevice }: SiteMapProps) {
  const { t } = useTranslation();
  const [token, setToken] = useState(() => localStorage.getItem(CESIUM_TOKEN_STORAGE_KEY) ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [placingHome, setPlacingHome] = useState(false);
  const [altitudeInput, setAltitudeInput] = useState("");
  const [contextMenu, setContextMenu] = useState<DeviceContextMenuState | null>(null);
  const setHome = useGroundStationSitesStore((s) => s.setHome);
  const addDevice = useGroundStationSitesStore((s) => s.addDevice);

  const { containerRef, sampleAltitude } = useGroundStationMapViewer({
    token,
    home: site.home,
    placingHome,
    onPlaceHome: (home) => {
      setHome(site.id, home);
      setPlacingHome(false);
    },
    devices: site.devices,
    selectedDeviceId,
    onMapRightClick: (x, y, lat, lon) => setContextMenu({ x, y, lat, lon }),
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

  function saveToken() {
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    localStorage.setItem(CESIUM_TOKEN_STORAGE_KEY, trimmed);
    setToken(trimmed);
  }

  function commitAltitude() {
    const parsed = Number(altitudeInput);
    if (!site.home || !Number.isFinite(parsed)) return;
    setHome(site.id, { ...site.home, altitudeM: parsed });
  }

  async function handleAddDevice(kind: DeviceKind) {
    if (!contextMenu) return;
    const { lat, lon } = contextMenu;
    setContextMenu(null);
    const altitudeM = await sampleAltitude(lat, lon);
    const preset = defaultPresetFor(kind);
    const index = site.devices.filter((d) => d.kind === kind).length + 1;
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

  if (!token) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Alert variant="info">
          <AlertDescription>
            {t("map.token.intro")}{" "}
            <a href="https://ion.cesium.com/tokens" target="_blank" rel="noreferrer" className="underline">
              ion.cesium.com/tokens
            </a>
            . {t("map.token.instructions")}
          </AlertDescription>
        </Alert>
        <div className="flex max-w-md gap-2">
          <Input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder={t("map.token.placeholder")} />
          <Button onClick={saveToken}>{t("map.token.save")}</Button>
        </div>
      </div>
    );
  }

  return (
    // onContextMenu is suppressed so a right-click opens this page's own "Add beacon/antenna
    // here" popup instead of the browser's native context menu - same convention as
    // LiveMapSection's own right-click popup.
    <div className="relative flex-1" onContextMenu={(e) => e.preventDefault()}>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-t-lg bg-card/90 px-3 py-2 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={placingHome ? "secondary" : "outline"} onClick={() => setPlacingHome((v) => !v)}>
            {t("groundStation.map.setHome")}
          </Button>
          {placingHome && <p className="text-xs text-muted-foreground">{t("groundStation.map.settingHomeHint")}</p>}
          {!site.home && !placingHome && <p className="text-xs text-muted-foreground">{t("groundStation.map.noHome")}</p>}
          <p className="text-xs text-muted-foreground">{t("groundStation.map.rightClickHint")}</p>
        </div>
        {site.home && (
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <span>
              {site.home.lat.toFixed(6)}, {site.home.lon.toFixed(6)}
            </span>
            <label className="flex items-center gap-1">
              {t("groundStation.map.homeAltitude")}
              <Input
                type="number"
                value={altitudeInput || Math.round(site.home.altitudeM)}
                onFocus={(e) => setAltitudeInput(e.target.value)}
                onChange={(e) => setAltitudeInput(e.target.value)}
                onBlur={() => {
                  commitAltitude();
                  setAltitudeInput("");
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className="h-6 w-20 font-mono text-xs"
              />
            </label>
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

interface DevicePropertiesProps {
  siteId: string;
  device: SiteDevice;
}

function DeviceProperties({ siteId, device }: DevicePropertiesProps) {
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
      <label className="flex items-center justify-between gap-2 text-xs">
        {t("groundStation.devices.range")}
        <Input
          type="number"
          value={device.rangeM}
          onChange={(e) => patchField({ rangeM: Number(e.target.value) || 0 })}
          className="h-6 w-20 font-mono text-xs"
        />
      </label>
      {device.pattern !== "omni" && (
        <label className="flex items-center justify-between gap-2 text-xs">
          {t("groundStation.devices.bearing")}
          <Input
            type="number"
            value={device.bearingDeg}
            onChange={(e) => patchField({ bearingDeg: Number(e.target.value) || 0 })}
            className="h-6 w-20 font-mono text-xs"
          />
        </label>
      )}
      {device.pattern === "directional" && (
        <label className="flex items-center justify-between gap-2 text-xs">
          {t("groundStation.devices.beamwidth")}
          <Input
            type="number"
            value={device.beamwidthDeg}
            onChange={(e) => patchField({ beamwidthDeg: Number(e.target.value) || 0 })}
            className="h-6 w-20 font-mono text-xs"
          />
        </label>
      )}
      <label className="flex items-center justify-between gap-2 text-xs">
        {t("groundStation.devices.altitude")}
        <Input
          type="number"
          value={Math.round(device.altitudeM)}
          onChange={(e) => patchField({ altitudeM: Number(e.target.value) || 0 })}
          className="h-6 w-20 font-mono text-xs"
        />
      </label>
    </div>
  );
}

interface DevicesPanelProps {
  site: Site;
  selectedDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
}

function DevicesPanel({ site, selectedDeviceId, onSelectDevice }: DevicesPanelProps) {
  const { t } = useTranslation();
  const renameDevice = useGroundStationSitesStore((s) => s.updateDevice);
  const removeDevice = useGroundStationSitesStore((s) => s.removeDevice);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteDevice, setConfirmDeleteDevice] = useState<SiteDevice | null>(null);

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
    <div className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-3">
      <h2 className="text-xs font-bold tracking-wide uppercase">{t("groundStation.devices.heading")}</h2>

      {site.devices.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("groundStation.devices.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {site.devices.map((device) => (
            <li key={device.id}>
              {editingId === device.id ? (
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
                  className={`group flex items-center gap-1 rounded-md p-1 ${device.id === selectedDeviceId ? "bg-accent" : "hover:bg-accent/50"}`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectDevice(device.id === selectedDeviceId ? null : device.id)}
                    className="flex flex-1 items-center gap-1.5 truncate text-left text-sm"
                  >
                    {device.kind === "beacon" ? (
                      <Radio className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <RadioTower className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{device.name}</span>
                  </button>
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
                </div>
              )}
              {selectedDevice?.id === device.id && <DeviceProperties siteId={site.id} device={device} />}
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
 * Phase 2: beacon/antenna placement (right-click, mirroring LiveMapSection's own popup), preset
 * selection, and a per-site device list with a property panel. The coverage-gradient overlay
 * itself is a later phase - this only draws each device's own top-down lobe outline for now.
 */
export function GroundStationView() {
  const { t } = useTranslation();
  const sites = useGroundStationSitesStore((s) => s.sites);
  const activeSiteId = useGroundStationSitesStore((s) => s.activeSiteId);
  const activeSite = sites.find((s) => s.id === activeSiteId) ?? null;
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  // A device selected in one site is meaningless once a different site becomes active (or none
  // does) - reset during render (React's own "adjusting state when a prop changes" pattern,
  // https://react.dev/learn/you-might-not-need-an-effect) rather than an effect that would
  // otherwise briefly render one extra frame with the stale selection still applied.
  const [prevActiveSiteId, setPrevActiveSiteId] = useState(activeSiteId);
  if (activeSiteId !== prevActiveSiteId) {
    setPrevActiveSiteId(activeSiteId);
    setSelectedDeviceId(null);
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
              <SiteMap key={activeSite.id} site={activeSite} selectedDeviceId={selectedDeviceId} onSelectDevice={setSelectedDeviceId} />
              <DevicesPanel site={activeSite} selectedDeviceId={selectedDeviceId} onSelectDevice={setSelectedDeviceId} />
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
