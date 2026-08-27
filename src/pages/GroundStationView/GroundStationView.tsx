import { ArrowLeft, Check, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CESIUM_TOKEN_STORAGE_KEY } from "../../constants";
import { useGroundStationSitesStore } from "../../stores/groundStationSitesStore/groundStationSitesStore";
import type { Site } from "../../stores/groundStationSitesStore/types";
import { useGroundStationMapViewer } from "./useGroundStationMapViewer";

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

function SiteMap({ site }: { site: Site }) {
  const { t } = useTranslation();
  const [token, setToken] = useState(() => localStorage.getItem(CESIUM_TOKEN_STORAGE_KEY) ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [placingHome, setPlacingHome] = useState(false);
  const [altitudeInput, setAltitudeInput] = useState("");
  const setHome = useGroundStationSitesStore((s) => s.setHome);

  const { containerRef } = useGroundStationMapViewer({
    token,
    home: site.home,
    placingHome,
    onPlaceHome: (home) => {
      setHome(site.id, home);
      setPlacingHome(false);
    },
  });

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
    <div className="relative flex-1">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-t-lg bg-card/90 px-3 py-2 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={placingHome ? "secondary" : "outline"} onClick={() => setPlacingHome((v) => !v)}>
            {t("groundStation.map.setHome")}
          </Button>
          {placingHome && <p className="text-xs text-muted-foreground">{t("groundStation.map.settingHomeHint")}</p>}
          {!site.home && !placingHome && <p className="text-xs text-muted-foreground">{t("groundStation.map.noHome")}</p>}
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
    </div>
  );
}

/**
 * Pre-flight site planning: place a home position plus beacons/antennas on a real terrain
 * map, save the layout, and preview line-of-sight coverage - see the "Ground Station" plan.
 * Phase 1: saved sites (create/rename/delete) and Set Home on a top-down-locked Cesium map.
 * Beacon/antenna placement and the coverage overlay land in later phases.
 */
export function GroundStationView() {
  const { t } = useTranslation();
  const sites = useGroundStationSitesStore((s) => s.sites);
  const activeSiteId = useGroundStationSitesStore((s) => s.activeSiteId);
  const activeSite = sites.find((s) => s.id === activeSiteId) ?? null;

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
            <SiteMap key={activeSite.id} site={activeSite} />
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
