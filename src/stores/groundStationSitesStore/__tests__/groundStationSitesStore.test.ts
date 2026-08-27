import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGroundStationSitesStore } from "../groundStationSitesStore";
import type { Site } from "../types";

const STORAGE_KEY = "ardulens.groundStationSites";

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  useGroundStationSitesStore.setState({ sites: [], activeSiteId: null });
});

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

describe("groundStationSitesStore", () => {
  it("starts with no sites and no active site", () => {
    expect(useGroundStationSitesStore.getState().sites).toEqual([]);
    expect(useGroundStationSitesStore.getState().activeSiteId).toBeNull();
  });

  it("createSite adds a new site with no home/devices yet, makes it active, and persists it", () => {
    const id = useGroundStationSitesStore.getState().createSite("Home field");

    const { sites, activeSiteId } = useGroundStationSitesStore.getState();
    expect(sites).toEqual([{ id, name: "Home field", home: null, devices: [] }]);
    expect(activeSiteId).toBe(id);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(sites);
  });

  it("renameSite updates only the matching site's name", () => {
    const id1 = useGroundStationSitesStore.getState().createSite("Site A");
    const id2 = useGroundStationSitesStore.getState().createSite("Site B");

    useGroundStationSitesStore.getState().renameSite(id1, "Renamed A");

    const { sites } = useGroundStationSitesStore.getState();
    expect(sites.find((s) => s.id === id1)?.name).toBe("Renamed A");
    expect(sites.find((s) => s.id === id2)?.name).toBe("Site B");
  });

  it("setHome records a home position for the matching site", () => {
    const id = useGroundStationSitesStore.getState().createSite("Home field");

    useGroundStationSitesStore.getState().setHome(id, { lat: 50.45, lon: 30.52, altitudeM: 120 });

    expect(useGroundStationSitesStore.getState().sites.find((s) => s.id === id)?.home).toEqual({
      lat: 50.45,
      lon: 30.52,
      altitudeM: 120,
    });
  });

  it("deleteSite removes the site and clears activeSiteId if it was the active one", () => {
    const id = useGroundStationSitesStore.getState().createSite("Home field");
    expect(useGroundStationSitesStore.getState().activeSiteId).toBe(id);

    useGroundStationSitesStore.getState().deleteSite(id);

    expect(useGroundStationSitesStore.getState().sites).toEqual([]);
    expect(useGroundStationSitesStore.getState().activeSiteId).toBeNull();
  });

  it("deleteSite leaves activeSiteId alone when deleting a different, inactive site", () => {
    const activeId = useGroundStationSitesStore.getState().createSite("Active site");
    const otherId = useGroundStationSitesStore.getState().createSite("Other site");
    useGroundStationSitesStore.getState().setActiveSite(activeId);

    useGroundStationSitesStore.getState().deleteSite(otherId);

    expect(useGroundStationSitesStore.getState().activeSiteId).toBe(activeId);
    expect(useGroundStationSitesStore.getState().sites.map((s) => s.id)).toEqual([activeId]);
  });

  it("persists sites across a fresh load from localStorage", () => {
    const id = useGroundStationSitesStore.getState().createSite("Home field");
    useGroundStationSitesStore.getState().setHome(id, { lat: 1, lon: 2, altitudeM: 3 });

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual([{ id, name: "Home field", home: { lat: 1, lon: 2, altitudeM: 3 }, devices: [] }]);
  });

  it("starts empty (rather than throwing) if the stored value is corrupt JSON", async () => {
    // The module reads localStorage once at import time (the store's initial `sites` value),
    // so exercising that guard for real needs a fresh module instance, not just re-reading the
    // already-initialized store.
    localStorage.setItem(STORAGE_KEY, "{not valid json");
    vi.resetModules();
    const { useGroundStationSitesStore: freshStore } = await import("../groundStationSitesStore");

    expect(freshStore.getState().sites).toEqual([]);
  });

  it("normalizes sites saved before `devices` existed (Phase 1) to an empty device list", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: "old-site", name: "Legacy site", home: null }]));
    vi.resetModules();
    const { useGroundStationSitesStore: freshStore } = await import("../groundStationSitesStore");

    expect(freshStore.getState().sites).toEqual([{ id: "old-site", name: "Legacy site", home: null, devices: [] }]);
  });

  describe("devices", () => {
    const beaconDraft = {
      kind: "beacon" as const,
      name: "Beacon 1",
      lat: 50.1,
      lon: 30.1,
      altitudeM: 100,
      pattern: "omni" as const,
      rangeM: 300,
      bearingDeg: 0,
      beamwidthDeg: 360,
      presetId: "beacon-standard",
    };

    it("addDevice appends a device with a fresh id to the matching site and persists it", () => {
      const siteId = useGroundStationSitesStore.getState().createSite("Site A");

      const deviceId = useGroundStationSitesStore.getState().addDevice(siteId, beaconDraft);

      const site = useGroundStationSitesStore.getState().sites.find((s) => s.id === siteId)!;
      expect(site.devices).toEqual([{ ...beaconDraft, id: deviceId }]);
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as Site[];
      expect(persisted[0]!.devices).toEqual([{ ...beaconDraft, id: deviceId }]);
    });

    it("updateDevice patches only the matching device, leaving others untouched", () => {
      const siteId = useGroundStationSitesStore.getState().createSite("Site A");
      const id1 = useGroundStationSitesStore.getState().addDevice(siteId, beaconDraft);
      const id2 = useGroundStationSitesStore.getState().addDevice(siteId, { ...beaconDraft, name: "Beacon 2" });

      useGroundStationSitesStore.getState().updateDevice(siteId, id1, { rangeM: 500, presetId: null });

      const site = useGroundStationSitesStore.getState().sites.find((s) => s.id === siteId)!;
      expect(site.devices.find((d) => d.id === id1)).toMatchObject({ rangeM: 500, presetId: null });
      expect(site.devices.find((d) => d.id === id2)).toMatchObject({ rangeM: 300, presetId: "beacon-standard" });
    });

    it("removeDevice removes only the matching device from the matching site", () => {
      const siteId = useGroundStationSitesStore.getState().createSite("Site A");
      const id1 = useGroundStationSitesStore.getState().addDevice(siteId, beaconDraft);
      const id2 = useGroundStationSitesStore.getState().addDevice(siteId, beaconDraft);

      useGroundStationSitesStore.getState().removeDevice(siteId, id1);

      const site = useGroundStationSitesStore.getState().sites.find((s) => s.id === siteId)!;
      expect(site.devices.map((d) => d.id)).toEqual([id2]);
    });
  });
});
