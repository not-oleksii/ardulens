import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGroundStationSitesStore } from "../groundStationSitesStore";

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

  it("createSite adds a new site with no home yet, makes it active, and persists it", () => {
    const id = useGroundStationSitesStore.getState().createSite("Home field");

    const { sites, activeSiteId } = useGroundStationSitesStore.getState();
    expect(sites).toEqual([{ id, name: "Home field", home: null }]);
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
    expect(JSON.parse(raw!)).toEqual([{ id, name: "Home field", home: { lat: 1, lon: 2, altitudeM: 3 } }]);
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
});
