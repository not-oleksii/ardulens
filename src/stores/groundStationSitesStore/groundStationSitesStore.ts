import { create } from "zustand";
import type { Site, SiteDevice, SiteHome } from "./types";

const STORAGE_KEY = "ardulens.groundStationSites";

// Manual localStorage read/write (not zustand's own persist middleware), matching this app's
// existing convention (see themeStore.ts) rather than introducing a second persistence pattern.
function loadSites(): Site[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // `devices` didn't exist before Phase 2 - sites saved by that earlier version load here with
    // no such field at all, not an empty array, so every read normalizes it rather than assuming
    // every stored Site already has the current shape.
    return (parsed as Site[]).map((site) => ({ ...site, devices: site.devices ?? [] }));
  } catch {
    // Corrupt/foreign JSON in this key - starting empty is safer than throwing on every load.
    return [];
  }
}

function persist(sites: Site[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
}

interface GroundStationSitesState {
  sites: Site[];
  activeSiteId: string | null;
  createSite: (name: string) => string;
  renameSite: (id: string, name: string) => void;
  deleteSite: (id: string) => void;
  setActiveSite: (id: string | null) => void;
  setHome: (id: string, home: SiteHome) => void;
  addDevice: (siteId: string, device: Omit<SiteDevice, "id">) => string;
  updateDevice: (siteId: string, deviceId: string, patch: Partial<Omit<SiteDevice, "id">>) => void;
  removeDevice: (siteId: string, deviceId: string) => void;
}

export const useGroundStationSitesStore = create<GroundStationSitesState>((set) => ({
  sites: loadSites(),
  activeSiteId: null,

  createSite: (name) => {
    const id = crypto.randomUUID();
    set((s) => {
      const sites = [...s.sites, { id, name, home: null, devices: [] }];
      persist(sites);
      return { sites, activeSiteId: id };
    });
    return id;
  },

  renameSite: (id, name) => {
    set((s) => {
      const sites = s.sites.map((site) => (site.id === id ? { ...site, name } : site));
      persist(sites);
      return { sites };
    });
  },

  deleteSite: (id) => {
    set((s) => {
      const sites = s.sites.filter((site) => site.id !== id);
      persist(sites);
      return { sites, activeSiteId: s.activeSiteId === id ? null : s.activeSiteId };
    });
  },

  setActiveSite: (id) => set({ activeSiteId: id }),

  setHome: (id, home) => {
    set((s) => {
      const sites = s.sites.map((site) => (site.id === id ? { ...site, home } : site));
      persist(sites);
      return { sites };
    });
  },

  addDevice: (siteId, device) => {
    const id = crypto.randomUUID();
    set((s) => {
      const sites = s.sites.map((site) => (site.id === siteId ? { ...site, devices: [...site.devices, { ...device, id }] } : site));
      persist(sites);
      return { sites };
    });
    return id;
  },

  updateDevice: (siteId, deviceId, patch) => {
    set((s) => {
      const sites = s.sites.map((site) =>
        site.id !== siteId ? site : { ...site, devices: site.devices.map((d) => (d.id === deviceId ? { ...d, ...patch } : d)) },
      );
      persist(sites);
      return { sites };
    });
  },

  removeDevice: (siteId, deviceId) => {
    set((s) => {
      const sites = s.sites.map((site) =>
        site.id !== siteId ? site : { ...site, devices: site.devices.filter((d) => d.id !== deviceId) },
      );
      persist(sites);
      return { sites };
    });
  },
}));
