import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Cartesian3 } from "cesium";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGroundStationSitesStore } from "../../../stores/groundStationSitesStore/groundStationSitesStore";
import { GroundStationView } from "../GroundStationView";

// Same reasoning/mocking approach as LiveMapSection.test.tsx: Viewer/Terrain/
// sampleTerrainMostDetailed/ScreenSpaceEventHandler do real WebGL/network/canvas work jsdom
// can't provide, so only those are replaced.
const { MockViewer, MockScreenSpaceEventHandler, viewerInstances, registeredClickHandlers } = vi.hoisted(() => {
  class MockEntity {
    position: unknown;
    constructor(opts: Record<string, unknown>) {
      Object.assign(this, opts);
    }
  }
  const viewerInstances: MockViewer[] = [];
  const registeredClickHandlers: Array<(movement: { position: unknown }) => void> = [];
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
    setInputAction(callback: (movement: { position: unknown }) => void) {
      registeredClickHandlers.push(callback);
    }
    destroy = vi.fn();
  }
  return { MockViewer, MockScreenSpaceEventHandler, viewerInstances, registeredClickHandlers };
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
      registeredClickHandlers.at(-1)?.({ position: { x: 10, y: 10 } });
      // Flushes the mocked sampleTerrainMostDetailed() promise chain the click handler awaits.
      await Promise.resolve();
    });
  };

  return {
    user,
    createSite,
    typeToken,
    clickSaveToken,
    clickSetHome,
    simulateMapClick,
  };
}

beforeEach(() => {
  localStorage.clear();
  viewerInstances.length = 0;
  registeredClickHandlers.length = 0;
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
});
