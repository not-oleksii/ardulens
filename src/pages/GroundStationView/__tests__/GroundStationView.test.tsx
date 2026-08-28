import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGroundStationSitesStore } from "../../../stores/groundStationSitesStore/groundStationSitesStore";
import { GroundStationView } from "../GroundStationView";

// maplibre-gl needs a real WebGL context jsdom can't provide, so the Map/Marker classes are
// replaced with minimal stand-ins that track enough state (registered event handlers, added
// sources/layers, marker positions) for these tests to drive and observe them - same reasoning
// as this app's existing Cesium mocks (see LiveMapSection.test.tsx).
const { MockMap, MockMarker, mapInstances } = vi.hoisted(() => {
  type MapEventHandler = (e: { lngLat: { lat: number; lng: number }; point: { x: number; y: number }; preventDefault: () => void }) => void;

  class MockMarker {
    static instances: MockMarker[] = [];
    element: HTMLElement;
    lngLat = { lat: 0, lng: 0 };
    dragHandler: (() => void) | null = null;
    removed = false;
    draggable: boolean;
    constructor(opts: { element: HTMLElement; draggable?: boolean }) {
      this.element = opts.element;
      this.draggable = opts.draggable ?? false;
      MockMarker.instances.push(this);
    }
    setLngLat([lng, lat]: [number, number]) {
      this.lngLat = { lat, lng };
      return this;
    }
    getLngLat() {
      return this.lngLat;
    }
    addTo() {
      return this;
    }
    on(event: string, cb: () => void) {
      if (event === "dragend") this.dragHandler = cb;
      return this;
    }
    setDraggable(draggable: boolean) {
      this.draggable = draggable;
      return this;
    }
    remove() {
      this.removed = true;
      return this;
    }
  }

  const mapInstances: MockMap[] = [];
  class MockMap {
    handlers = new Map<string, MapEventHandler>();
    sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    layers = new Set<string>();
    dragRotate = { disable: vi.fn() };
    touchZoomRotate = { disableRotation: vi.fn() };
    flyTo = vi.fn();
    remove = vi.fn();
    setPaintProperty = vi.fn();
    constructor() {
      mapInstances.push(this);
    }
    on(event: string, cb: MapEventHandler | (() => void)) {
      if (event === "load") {
        (cb as () => void)();
        return;
      }
      this.handlers.set(event, cb);
    }
    addSource(id: string) {
      this.sources.set(id, { setData: vi.fn(() => Promise.resolve()) });
    }
    getSource(id: string) {
      return this.sources.get(id);
    }
    removeSource(id: string) {
      this.sources.delete(id);
    }
    addLayer(opts: { id: string }) {
      this.layers.add(opts.id);
    }
    getLayer(id: string) {
      return this.layers.has(id) ? {} : undefined;
    }
    removeLayer(id: string) {
      this.layers.delete(id);
    }
  }
  return { MockMap, MockMarker, mapInstances };
});

vi.mock("maplibre-gl", () => ({ Map: MockMap, Marker: MockMarker, setWorkerUrl: vi.fn() }));
// The hook's `?worker&url` import needs its own mock too - jsdom/Vitest doesn't run Vite's
// asset-import pipeline, so this specifier would otherwise fail to resolve at all.
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({ default: "mock-worker-url" }));

// Terrain sampling always returns a fixed 123m, regardless of how many points are asked for -
// the tile-fetch/decode mechanics themselves are covered separately in terrainElevation.test.ts,
// this file only needs to verify the UI wires the result through correctly.
vi.mock("../terrainElevation", () => ({ sampleTerrainElevations: vi.fn((points: unknown[]) => Promise.resolve(points.map(() => 123))) }));

function getView() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <GroundStationView />
    </MemoryRouter>,
  );

  const clickNewSite = () => user.click(screen.getByRole("button", { name: /Новий майданчик/ }));
  const typeNewSiteName = (name: string) => user.type(screen.getByPlaceholderText("Назва майданчика"), name);
  const confirmNewSite = () => user.click(screen.getByRole("button", { name: "Створити" }));
  const createSite = async (name: string) => {
    await clickNewSite();
    await typeNewSiteName(name);
    await confirmNewSite();
  };
  const clickSetHome = () => user.click(screen.getByRole("button", { name: "Встановити дім" }));
  const getLastMap = () => mapInstances.at(-1)!;
  const simulateMapClick = async (lat: number, lon: number) => {
    await act(async () => {
      getLastMap().handlers.get("click")?.({ lngLat: { lat, lng: lon }, point: { x: 10, y: 10 }, preventDefault: vi.fn() });
      // Flushes the mocked sampleTerrainElevations() promise chain the click handler awaits.
      await Promise.resolve();
    });
  };
  const simulateMapRightClick = (lat: number, lon: number) => {
    act(() => {
      getLastMap().handlers.get("contextmenu")?.({ lngLat: { lat, lng: lon }, point: { x: 10, y: 10 }, preventDefault: vi.fn() });
    });
  };

  return { user, createSite, clickSetHome, simulateMapClick, simulateMapRightClick, getLastMap };
}

beforeEach(() => {
  localStorage.clear();
  mapInstances.length = 0;
  MockMarker.instances.length = 0;
  useGroundStationSitesStore.setState({ sites: [], activeSiteId: null });
  // jsdom doesn't implement a real Canvas 2D context (no `canvas` native module in this
  // project) - the coverage raster's rasterToCanvas() only needs createImageData/putImageData/
  // toDataURL to not throw, not to actually rasterize anything.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,");
});

describe("GroundStationView", () => {
  it("shows the empty-sites message and an empty-state prompt when no sites exist", () => {
    getView();
    expect(screen.getByText(/Ще немає майданчиків/)).toBeInTheDocument();
    expect(screen.getByText(/Виберіть або створіть майданчик/)).toBeInTheDocument();
  });

  it("creating a site adds it to the list, makes it active, and shows the map right away (no token step)", async () => {
    const { createSite } = getView();

    await createSite("Home field");

    expect(screen.getByText("Home field")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Встановити дім" })).toBeInTheDocument();
    expect(screen.getByText("Дім ще не встановлено")).toBeInTheDocument();
  });

  it("clicking Set Home then the map places home at the sampled terrain altitude", async () => {
    const { createSite, clickSetHome, simulateMapClick } = getView();
    await createSite("Home field");

    await clickSetHome();
    expect(screen.getByText(/Клацніть на карті/)).toBeInTheDocument();
    await simulateMapClick(50.45, 30.52);

    expect(await screen.findByDisplayValue("123")).toBeInTheDocument();
    expect(screen.getByText(/50.450000, 30.520000/)).toBeInTheDocument();
    expect(screen.queryByText("Дім ще не встановлено")).not.toBeInTheDocument();
  });

  it("renaming a site updates its displayed name", async () => {
    const { createSite, user } = getView();
    await createSite("Home field");

    await user.click(screen.getByRole("button", { name: "Перейменувати" }));
    const input = screen.getByDisplayValue("Home field");
    await user.clear(input);
    await user.type(input, "Renamed field{Enter}");

    expect(screen.getByText("Renamed field")).toBeInTheDocument();
    expect(screen.queryByText("Home field")).not.toBeInTheDocument();
  });

  it("deleting a site removes it after confirming", async () => {
    const { createSite, user } = getView();
    await createSite("Home field");

    await user.click(screen.getByRole("button", { name: "Видалити" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Видалити майданчик" }));

    expect(screen.queryByText("Home field")).not.toBeInTheDocument();
    expect(screen.getByText(/Ще немає майданчиків/)).toBeInTheDocument();
  });

  it("right-clicking the map then 'Add beacon here' creates a beacon device at the clicked point", async () => {
    const { createSite, simulateMapRightClick, user } = getView();
    await createSite("Home field");

    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));

    expect(await screen.findByText("Маячок 1")).toBeInTheDocument();
  });

  it("creating a device auto-selects it, showing its property panel defaulted from the matching preset", async () => {
    const { createSite, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    simulateMapRightClick(50.1, 30.1);

    await user.click(screen.getByRole("button", { name: "Додати антену тут" }));

    // "antenna-omni", the first antenna preset, defaults to a 2000m range.
    expect(await screen.findByDisplayValue("2000")).toBeInTheDocument();
  });

  it("clicking an already-selected device again deselects it, hiding the property panel", async () => {
    const { createSite, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати антену тут" }));
    await screen.findByDisplayValue("2000");

    await user.click(screen.getByText("Антена 1"));

    expect(screen.queryByDisplayValue("2000")).not.toBeInTheDocument();
  });

  it("hand-editing a device's range clears its preset back to custom", async () => {
    const { createSite, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати антену тут" }));
    const rangeInput = await screen.findByDisplayValue("2000");

    await user.clear(rangeInput);
    await user.type(rangeInput, "500");
    await user.tab(); // commits on blur, not per keystroke - see NumberField's own doc comment.

    expect(useGroundStationSitesStore.getState().sites[0]!.devices[0]).toMatchObject({ rangeM: 500, presetId: null });
  });

  it("deleting a device removes it after confirming", async () => {
    const { createSite, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));
    const row = (await screen.findByText("Маячок 1")).closest("li")!;

    await user.click(within(row).getByRole("button", { name: "Видалити" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Видалити пристрій" }));

    expect(screen.queryByText("Маячок 1")).not.toBeInTheDocument();
  });

  it("toggling Show coverage draws a coverage overlay layer and flips the button to Hide coverage", async () => {
    const { createSite, simulateMapRightClick, user, getLastMap } = getView();
    await createSite("Home field");
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));
    await screen.findByText("Маячок 1");

    await user.click(await screen.findByRole("button", { name: "Показати покриття" }));

    expect(await screen.findByRole("button", { name: "Приховати покриття" })).toBeInTheDocument();
    const coverageLayers = Array.from(getLastMap().layers).filter((id) => id.startsWith("device-coverage-layer-"));
    expect(coverageLayers).toHaveLength(1);
  });

  it("toggling coverage back off removes the overlay layer", async () => {
    const { createSite, simulateMapRightClick, user, getLastMap } = getView();
    await createSite("Home field");
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));
    await user.click(await screen.findByRole("button", { name: "Показати покриття" }));
    await screen.findByRole("button", { name: "Приховати покриття" });

    await user.click(screen.getByRole("button", { name: "Приховати покриття" }));

    expect(await screen.findByRole("button", { name: "Показати покриття" })).toBeInTheDocument();
    const coverageLayers = Array.from(getLastMap().layers).filter((id) => id.startsWith("device-coverage-layer-"));
    expect(coverageLayers).toHaveLength(0);
  });

  it("the combined coverage toggle is disabled with no devices, and draws a merged overlay once one exists", async () => {
    const { createSite, simulateMapRightClick, user, getLastMap } = getView();
    await createSite("Home field");

    expect(screen.getByRole("button", { name: "Показати сумарне покриття" })).toBeDisabled();

    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));
    await screen.findByText("Маячок 1");

    const toggle = screen.getByRole("button", { name: "Показати сумарне покриття" });
    expect(toggle).toBeEnabled();
    await act(async () => {
      await user.click(toggle);
      await Promise.resolve();
    });

    expect(await screen.findByRole("button", { name: "Приховати сумарне покриття" })).toBeInTheDocument();
    expect(getLastMap().layers.has("combined-coverage-layer")).toBe(true);
  });

  it("dragging a device marker moves it to the dropped position, re-sampling altitude", async () => {
    const { createSite, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));
    await screen.findByText("Маячок 1");
    const marker = MockMarker.instances.at(-1)!;

    await act(async () => {
      marker.setLngLat([31.5, 51.5]);
      marker.dragHandler?.();
      await Promise.resolve();
    });

    const device = useGroundStationSitesStore.getState().sites[0]!.devices[0]!;
    expect(device).toMatchObject({ lat: 51.5, lon: 31.5, altitudeM: 123 });
  });

  it("dragging a device marker applies the new position immediately, not just after the terrain re-sample resolves", async () => {
    const { createSite, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));
    await screen.findByText("Маячок 1");
    const marker = MockMarker.instances.at(-1)!;

    // No `await`/microtask flush here, unlike the test above - a regression back to updating
    // position only inside sampleTerrainElevations().then() would still show the pre-drag
    // position at this point, since a .then() callback never runs synchronously.
    act(() => {
      marker.setLngLat([31.5, 51.5]);
      marker.dragHandler?.();
    });

    const device = useGroundStationSitesStore.getState().sites[0]!.devices[0]!;
    expect(device.lat).toBe(51.5);
    expect(device.lon).toBe(31.5);
  });

  it("dragging a device then immediately changing another of its fields does not snap it back to the pre-drag position", async () => {
    const { createSite, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));
    await screen.findByText("Маячок 1");
    const marker = MockMarker.instances.at(-1)!;
    const siteId = useGroundStationSitesStore.getState().sites[0]!.id;
    const deviceId = useGroundStationSitesStore.getState().sites[0]!.devices[0]!.id;

    act(() => {
      marker.setLngLat([31.5, 51.5]);
      marker.dragHandler?.();
    });
    // Any other store write for this device (e.g. applying a different preset) re-runs the
    // devices-drawing effect before the drag's own terrain re-sample has resolved - this used to
    // re-sync the marker (and its coverage lobe) back to the stale pre-drag position still sitting
    // in the store, visibly "teleporting" it back.
    act(() => {
      useGroundStationSitesStore.getState().updateDevice(siteId, deviceId, { rangeM: 750 });
    });

    const device = useGroundStationSitesStore.getState().sites[0]!.devices[0]!;
    expect(device.lat).toBe(51.5);
    expect(device.lon).toBe(31.5);
  });

  it("locking a device makes its marker non-draggable, and unlocking restores it", async () => {
    const { createSite, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));
    await screen.findByText("Маячок 1");
    const marker = MockMarker.instances.at(-1)!;
    expect(marker.draggable).toBe(true);

    await user.click(screen.getByRole("button", { name: "Заблокувати" }));

    expect(useGroundStationSitesStore.getState().sites[0]!.devices[0]!.locked).toBe(true);
    expect(marker.draggable).toBe(false);
    expect(await screen.findByRole("button", { name: "Розблокувати" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Розблокувати" }));

    expect(useGroundStationSitesStore.getState().sites[0]!.devices[0]!.locked).toBe(false);
    expect(marker.draggable).toBe(true);
  });

  it("dragging a directional device's rotation handle updates its bearing", async () => {
    const { createSite, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));
    await screen.findByText("Маячок 1");
    // "omni" (the beacon default) gets no rotation handle at all - switch to a bearing-sensitive
    // pattern directly via the store, the same way this suite already exercises store writes that
    // aren't worth driving through the Preset <Select> (a Radix portal component).
    const siteId = useGroundStationSitesStore.getState().sites[0]!.id;
    const deviceId = useGroundStationSitesStore.getState().sites[0]!.devices[0]!.id;
    const markersBefore = MockMarker.instances.length;
    act(() => {
      useGroundStationSitesStore.getState().updateDevice(siteId, deviceId, { pattern: "directional", bearingDeg: 0, rangeM: 500 });
    });

    expect(MockMarker.instances.length).toBe(markersBefore + 1); // the new rotation-handle marker
    const handle = MockMarker.instances.at(-1)!;

    act(() => {
      handle.setLngLat([30.2, 50.1]); // due east of the device (50.1, 30.1)
      handle.dragHandler?.();
    });

    const bearingDeg = useGroundStationSitesStore.getState().sites[0]!.devices[0]!.bearingDeg;
    expect(bearingDeg).toBeGreaterThan(45);
    expect(bearingDeg).toBeLessThan(135);
  });

  it("clicking a device marker on the map selects it", async () => {
    const { createSite, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));
    await screen.findByDisplayValue("300"); // beacon-standard's default range - auto-selected.
    // Deselect first (clicking the list row toggles it off) so the marker click is what
    // re-selects it, not a leftover selection from creation.
    await user.click(screen.getByText("Маячок 1"));
    expect(screen.queryByDisplayValue("300")).not.toBeInTheDocument();
    const marker = MockMarker.instances.at(-1)!;

    marker.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(await screen.findByDisplayValue("300")).toBeInTheDocument();
  });

  it("collapsing the Saved sites panel hides names but keeps sites clickable by icon", async () => {
    const { createSite, user } = getView();
    await createSite("Home field");
    expect(screen.getByText("Home field")).toBeInTheDocument();

    // Both panels share the same generic collapse/expand labels (matching this app's existing
    // Sidebar.tsx convention) - Saved sites renders first, so its own toggle is always index 0.
    await user.click(screen.getAllByRole("button", { name: "Згорнути бічну панель" })[0]!);

    expect(screen.queryByText("Home field")).not.toBeInTheDocument();
    const collapsedSiteButton = screen.getByRole("button", { name: "Home field" });
    expect(collapsedSiteButton).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Розгорнути бічну панель" })[0]!);
    expect(screen.getByText("Home field")).toBeInTheDocument();
  });

  it("collapsing the Devices panel hides device names and the property panel", async () => {
    const { createSite, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));
    await screen.findByDisplayValue("300");

    await user.click(screen.getAllByRole("button", { name: "Згорнути бічну панель" })[1]!);

    expect(screen.queryByText("Маячок 1")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("300")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Маячок 1" })).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Розгорнути бічну панель" })[1]!);
    expect(screen.getByText("Маячок 1")).toBeInTheDocument();
  });
});
