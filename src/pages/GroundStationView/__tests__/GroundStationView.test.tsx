import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Cartesian3, ScreenSpaceEventType } from "cesium";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGroundStationSitesStore } from "../../../stores/groundStationSitesStore/groundStationSitesStore";
import { GroundStationView } from "../GroundStationView";

// Same reasoning/mocking approach as LiveMapSection.test.tsx: Viewer/Terrain/
// sampleTerrainMostDetailed/ScreenSpaceEventHandler do real WebGL/network/canvas work jsdom
// can't provide, so only those are replaced.
const { MockViewer, MockScreenSpaceEventHandler, viewerInstances, registeredHandlers } = vi.hoisted(() => {
  class MockEntity {
    position: unknown;
    polygon?: Record<string, unknown>;
    constructor(opts: Record<string, unknown>) {
      Object.assign(this, opts);
    }
  }
  const viewerInstances: MockViewer[] = [];
  // Keyed by ScreenSpaceEventType (LEFT_CLICK for Set Home, RIGHT_CLICK for the beacon/antenna
  // popup) rather than a flat array - this hook registers both on the same handler instance, so
  // "the last registered handler" no longer identifies which gesture a test means to simulate.
  const registeredHandlers = new Map<number, (movement: { position: { x: number; y: number } }) => void>();
  class MockViewer {
    entities = {
      add: vi.fn((opts: Record<string, unknown>) => new MockEntity(opts)),
      remove: vi.fn(),
    };
    camera = { flyTo: vi.fn(), setView: vi.fn(), pickEllipsoid: vi.fn(), getPickRay: vi.fn() };
    scene = { canvas: {}, globe: { ellipsoid: {}, pick: vi.fn() }, screenSpaceCameraController: { enableTilt: true } };
    terrainProvider = {};
    #destroyed = false;
    destroy = vi.fn(() => {
      this.#destroyed = true;
    });
    isDestroyed = vi.fn(() => this.#destroyed);
    constructor() {
      viewerInstances.push(this);
    }
  }
  class MockScreenSpaceEventHandler {
    setInputAction(callback: (movement: { position: { x: number; y: number } }) => void, type: number) {
      registeredHandlers.set(type, callback);
    }
    destroy = vi.fn();
  }
  return { MockViewer, MockScreenSpaceEventHandler, viewerInstances, registeredHandlers };
});

vi.mock("cesium", async (importOriginal) => {
  const actual = await importOriginal<typeof import("cesium")>();
  return {
    ...actual,
    Viewer: MockViewer,
    ScreenSpaceEventHandler: MockScreenSpaceEventHandler,
    Terrain: { fromWorldTerrain: () => ({}) },
    sampleTerrainMostDetailed: () => Promise.resolve([{ height: 123 }]),
  };
});

// jsdom doesn't implement a real Canvas 2D context (no `canvas` native module in this project) -
// the coverage raster's rasterToCanvas() only needs createImageData/putImageData to not throw,
// not to actually rasterize anything, so a minimal stand-in is enough here.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});

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
  const typeToken = (text: string) => user.type(screen.getByPlaceholderText("Вставте сюди свій токен Cesium ion"), text);
  const clickSaveToken = () => user.click(screen.getByRole("button", { name: "Зберегти" }));
  const clickSetHome = () => user.click(screen.getByRole("button", { name: "Встановити дім" }));
  const getLastViewer = () => viewerInstances.at(-1)!;
  const simulateMapClick = async (lat: number, lon: number) => {
    getLastViewer().camera.pickEllipsoid.mockReturnValue(Cartesian3.fromDegrees(lon, lat, 0));
    await act(async () => {
      registeredHandlers.get(ScreenSpaceEventType.LEFT_CLICK)?.({ position: { x: 10, y: 10 } });
      // Flushes the mocked sampleTerrainMostDetailed() promise chain the click handler awaits.
      await Promise.resolve();
    });
  };
  const simulateMapRightClick = (lat: number, lon: number) => {
    getLastViewer().camera.pickEllipsoid.mockReturnValue(Cartesian3.fromDegrees(lon, lat, 0));
    // No promise chain to flush here (unlike the left-click/Set-Home handler above, this one
    // only opens a synchronous context menu) - a plain sync `act` is enough.
    act(() => {
      registeredHandlers.get(ScreenSpaceEventType.RIGHT_CLICK)?.({ position: { x: 10, y: 10 } });
    });
  };

  return {
    user,
    createSite,
    typeToken,
    clickSaveToken,
    clickSetHome,
    simulateMapClick,
    simulateMapRightClick,
  };
}

beforeEach(() => {
  localStorage.clear();
  viewerInstances.length = 0;
  registeredHandlers.clear();
  useGroundStationSitesStore.setState({ sites: [], activeSiteId: null });
});

describe("GroundStationView", () => {
  it("shows the empty-sites message and an empty-state prompt when no sites exist", () => {
    getView();
    expect(screen.getByText(/Ще немає майданчиків/)).toBeInTheDocument();
    expect(screen.getByText(/Виберіть або створіть майданчик/)).toBeInTheDocument();
  });

  it("creating a site adds it to the list, makes it active, and shows the token gate", async () => {
    const { createSite } = getView();

    await createSite("Home field");

    expect(screen.getByText("Home field")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Вставте сюди свій токен Cesium ion")).toBeInTheDocument();
  });

  it("entering a Cesium token reveals the map for the active site", async () => {
    const { createSite, typeToken, clickSaveToken } = getView();
    await createSite("Home field");

    await typeToken("test-token");
    await clickSaveToken();

    expect(screen.queryByPlaceholderText("Вставте сюди свій токен Cesium ion")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Встановити дім" })).toBeInTheDocument();
    expect(screen.getByText("Дім ще не встановлено")).toBeInTheDocument();
  });

  it("clicking Set Home then the map places home at the sampled terrain altitude", async () => {
    const { createSite, typeToken, clickSaveToken, clickSetHome, simulateMapClick } = getView();
    await createSite("Home field");
    await typeToken("test-token");
    await clickSaveToken();

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
    const { createSite, typeToken, clickSaveToken, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    await typeToken("test-token");
    await clickSaveToken();

    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));

    expect(await screen.findByText("Маячок 1")).toBeInTheDocument();
  });

  it("creating a device auto-selects it, showing its property panel defaulted from the matching preset", async () => {
    const { createSite, typeToken, clickSaveToken, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    await typeToken("test-token");
    await clickSaveToken();
    simulateMapRightClick(50.1, 30.1);

    await user.click(screen.getByRole("button", { name: "Додати антену тут" }));

    // "antenna-omni", the first antenna preset, defaults to a 2000m range.
    expect(await screen.findByDisplayValue("2000")).toBeInTheDocument();
  });

  it("clicking an already-selected device again deselects it, hiding the property panel", async () => {
    const { createSite, typeToken, clickSaveToken, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    await typeToken("test-token");
    await clickSaveToken();
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати антену тут" }));
    await screen.findByDisplayValue("2000");

    await user.click(screen.getByText("Антена 1"));

    expect(screen.queryByDisplayValue("2000")).not.toBeInTheDocument();
  });

  it("hand-editing a device's range clears its preset back to custom", async () => {
    const { createSite, typeToken, clickSaveToken, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    await typeToken("test-token");
    await clickSaveToken();
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати антену тут" }));
    const rangeInput = await screen.findByDisplayValue("2000");

    await user.clear(rangeInput);
    await user.type(rangeInput, "500");

    expect(useGroundStationSitesStore.getState().sites[0]!.devices[0]).toMatchObject({ rangeM: 500, presetId: null });
  });

  it("deleting a device removes it after confirming", async () => {
    const { createSite, typeToken, clickSaveToken, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    await typeToken("test-token");
    await clickSaveToken();
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));
    const row = (await screen.findByText("Маячок 1")).closest("li")!;

    await user.click(within(row).getByRole("button", { name: "Видалити" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Видалити пристрій" }));

    expect(screen.queryByText("Маячок 1")).not.toBeInTheDocument();
  });

  it("toggling Show coverage draws a coverage overlay and flips the button to Hide coverage", async () => {
    const { createSite, typeToken, clickSaveToken, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    await typeToken("test-token");
    await clickSaveToken();
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));
    await screen.findByText("Маячок 1");
    const addCallsBefore = viewerInstances.at(-1)!.entities.add.mock.calls.length;

    await user.click(await screen.findByRole("button", { name: "Показати покриття" }));

    expect(await screen.findByRole("button", { name: "Приховати покриття" })).toBeInTheDocument();
    const rectangleCalls = viewerInstances.at(-1)!.entities.add.mock.calls.slice(addCallsBefore).filter(([opts]) => "rectangle" in opts);
    expect(rectangleCalls.length).toBe(1);
  });

  it("toggling coverage back off removes the overlay entity", async () => {
    const { createSite, typeToken, clickSaveToken, simulateMapRightClick, user } = getView();
    await createSite("Home field");
    await typeToken("test-token");
    await clickSaveToken();
    simulateMapRightClick(50.1, 30.1);
    await user.click(screen.getByRole("button", { name: "Додати маячок тут" }));
    await user.click(await screen.findByRole("button", { name: "Показати покриття" }));
    await screen.findByRole("button", { name: "Приховати покриття" });

    await user.click(screen.getByRole("button", { name: "Приховати покриття" }));

    expect(await screen.findByRole("button", { name: "Показати покриття" })).toBeInTheDocument();
    expect(viewerInstances.at(-1)!.entities.remove).toHaveBeenCalled();
  });
});
