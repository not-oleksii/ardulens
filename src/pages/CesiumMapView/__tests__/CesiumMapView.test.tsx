import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlightBinBuilder } from "../../../builders/FlightBinBuilder/FlightBinBuilder";
import { getCoreWorker } from "../../../services/coreWorkerClient/coreWorkerClient";
import { useFileStore } from "../../../stores/fileStore/fileStore";
import { CesiumMapView } from "../CesiumMapView";

// Cesium's Viewer/Terrain do real WebGL/network work that jsdom can't provide - keep every
// other export real (Cartesian3, Color, PolylineGeometry, Primitive, etc. are pure math/
// data classes that work fine without a GPU, as proven by the standalone verification
// scripts used to check the gradient/framing math during development) and only replace the
// handful of classes that need a live browser: Viewer itself, Terrain.fromWorldTerrain()
// (starts a Cesium ion network fetch), and sampleTerrainMostDetailed() (terrain sampling).
const { MockViewer, viewerInstances } = vi.hoisted(() => {
  class MockEntity {
    show = true;
    constructor(opts: Record<string, unknown>) {
      Object.assign(this, opts);
    }
  }
  const viewerInstances: MockViewer[] = [];
  class MockViewer {
    scene = { primitives: { add: vi.fn(), remove: vi.fn() } };
    entities = {
      add: vi.fn((opts: Record<string, unknown>) => new MockEntity(opts)),
      remove: vi.fn(),
    };
    camera = { flyTo: vi.fn() };
    clock: Record<string, unknown> = {};
    timeline = { zoomTo: vi.fn() };
    terrainProvider = {};
    destroy = vi.fn();
    constructor() {
      viewerInstances.push(this);
    }
  }
  return { MockViewer, viewerInstances };
});

vi.mock("cesium", async (importOriginal) => {
  const actual = await importOriginal<typeof import("cesium")>();
  return {
    ...actual,
    Viewer: MockViewer,
    Terrain: { fromWorldTerrain: () => ({}) },
    sampleTerrainMostDetailed: () => Promise.resolve([{ height: 100 }]),
  };
});

vi.mock("../../../services/coreWorkerClient/coreWorkerClient", async () => {
  const actual = await vi.importActual<typeof import("../../../services/coreWorkerClient/coreWorkerClient")>(
    "../../../services/coreWorkerClient/coreWorkerClient",
  );
  return { getCoreWorker: vi.fn(actual.getCoreWorker) };
});

// Must match CesiumMapView's own TOKEN_STORAGE_KEY constant (not exported).
const TOKEN_STORAGE_KEY = "ardulens.cesiumIonToken";

function loadFile(name: string, buf: ArrayBuffer) {
  useFileStore.getState().setFile({ name, buf });
}

function sampleBinBuf() {
  // Yosemite Valley - real relief (cliffs around a flat valley floor). A short spoofing
  // window (a clear minority of the flight) demonstrates the GPS-loss markers too.
  return new FlightBinBuilder().withDurationSeconds(300).withBase(37.745, -119.593).withGpsSpoofing(120, 150).build();
}

function getView() {
  const user = userEvent.setup();
  render(<CesiumMapView />);

  const getTokenInput = () => screen.getByPlaceholderText("Вставте сюди свій токен Cesium ion");
  const getSaveButton = () => screen.getByRole("button", { name: "Зберегти" });
  const getMap = () => screen.queryByTestId("cesium-map");
  const getLastViewer = () => viewerInstances.at(-1);

  const typeToken = (text: string) => user.type(getTokenInput(), text);
  const clickSave = () => user.click(getSaveButton());

  return { user, getTokenInput, getSaveButton, getMap, getLastViewer, typeToken, clickSave };
}

beforeEach(() => {
  localStorage.clear();
  viewerInstances.length = 0;
});

afterEach(() => {
  useFileStore.getState().clearFile();
  vi.mocked(getCoreWorker).mockRestore();
});

describe("CesiumMapView", () => {
  it("shows the token entry screen when no token is saved", () => {
    const { getTokenInput, getMap } = getView();
    expect(getTokenInput()).toBeInTheDocument();
    expect(getMap()).not.toBeInTheDocument();
  });

  it("saves a token via the input and reveals the map UI", async () => {
    const { typeToken, clickSave, getMap } = getView();

    await typeToken("test-token");
    await clickSave();

    expect(getMap()).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe("test-token");
  });

  it("asks for confirmation before clearing the saved token", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { user, getMap } = getView();

    await user.click(screen.getByRole("button", { name: "Очистити збережений токен" }));
    expect(getMap()).toBeInTheDocument(); // not cleared yet
    const dialog = screen.getByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Очистити токен" }));

    expect(getMap()).not.toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("cancelling the clear-token confirmation keeps the token and map", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { user, getMap } = getView();

    await user.click(screen.getByRole("button", { name: "Очистити збережений токен" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Скасувати" }));

    expect(getMap()).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe("test-token");
  });

  it("shows a loading message while a file is being derived", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    let resolveParse!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveParse = resolve;
    });
    vi.mocked(getCoreWorker).mockReturnValueOnce({
      buildFlightMapDataFromBin: () => pending,
    } as unknown as ReturnType<typeof getCoreWorker>);
    loadFile("sample-flight.bin", sampleBinBuf());

    getView();

    expect(await screen.findByText("Розбір файлу...")).toBeInTheDocument();

    resolveParse(null);

    expect(await screen.findByText("У цьому файлі немає окремих повідомлень GPS/POS для карти (телеметрія skylog має лише одну об'єднану позицію).")).toBeInTheDocument();
    expect(screen.queryByText("Розбір файлу...")).not.toBeInTheDocument();
    // No track data means no track visibility to control - the legend would be dead weight.
    expect(screen.queryByText("Треки")).not.toBeInTheDocument();
  });

  it("surfaces a parse error instead of leaving it unhandled when the worker call throws", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(getCoreWorker).mockReturnValueOnce({
      buildFlightMapDataFromBin: () => Promise.reject(new Error("boom")),
    } as unknown as ReturnType<typeof getCoreWorker>);
    loadFile("sample-flight.bin", sampleBinBuf());

    getView();

    expect(await screen.findByText(/Помилка розбору: boom/)).toBeInTheDocument();
  });

  it("does not start deriving until a token is present, even if a file is already loaded", () => {
    loadFile("sample-flight.bin", sampleBinBuf());
    const { getTokenInput } = getView();

    expect(getTokenInput()).toBeInTheDocument();
    expect(screen.queryByText("Розбір файлу...")).not.toBeInTheDocument();
  });

  it("loads the sample flight and creates track/marker entities on the mocked viewer", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    loadFile("sample-flight.bin", sampleBinBuf());
    const { getLastViewer } = getView();

    // The sample flight always produces a GCS track + an animated aircraft marker, both
    // added via viewer.entities.add() - proving the loaded data actually reached the
    // (mocked) viewer.
    const viewerInstance = getLastViewer();
    expect(viewerInstance).toBeDefined();
    await vi.waitFor(() => expect(viewerInstance!.entities.add).toHaveBeenCalled());
    // Real track data is loaded, so the legend controlling track visibility should show.
    expect(await screen.findByText("Треки")).toBeInTheDocument();
  });
});
