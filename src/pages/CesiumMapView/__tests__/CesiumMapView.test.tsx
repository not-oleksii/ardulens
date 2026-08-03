import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCoreWorker } from "../../../services/coreWorkerClient/coreWorkerClient";
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

function getView() {
  const user = userEvent.setup();
  render(<CesiumMapView />);

  const getTokenInput = () => screen.getByPlaceholderText("Вставте сюди свій токен Cesium ion");
  const getSaveButton = () => screen.getByRole("button", { name: "Зберегти" });
  const getDropzone = () => screen.queryByTestId("cesium-dropzone");
  const getSampleButton = () => screen.getByRole("button", { name: "Приклад .bin" });
  const getLastViewer = () => viewerInstances.at(-1);

  const typeToken = (text: string) => user.type(getTokenInput(), text);
  const clickSave = () => user.click(getSaveButton());
  const clickSampleBin = () => user.click(getSampleButton());

  return { user, getTokenInput, getSaveButton, getDropzone, getSampleButton, getLastViewer, typeToken, clickSave, clickSampleBin };
}

beforeEach(() => {
  localStorage.clear();
  viewerInstances.length = 0;
});

afterEach(() => {
  vi.mocked(getCoreWorker).mockRestore();
});

describe("CesiumMapView", () => {
  it("shows the token entry screen when no token is saved", () => {
    const { getTokenInput, getDropzone } = getView();
    expect(getTokenInput()).toBeInTheDocument();
    expect(getDropzone()).not.toBeInTheDocument();
  });

  it("saves a token via the input and reveals the map UI", async () => {
    const { typeToken, clickSave, getDropzone } = getView();

    await typeToken("test-token");
    await clickSave();

    expect(getDropzone()).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe("test-token");
  });

  it("shows a loading spinner while parsing, via the shared FileDropzone", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    let resolveParse!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveParse = resolve;
    });
    vi.mocked(getCoreWorker).mockReturnValueOnce({
      buildFlightMapDataFromBin: () => pending,
    } as unknown as ReturnType<typeof getCoreWorker>);

    const { clickSampleBin, getSampleButton } = getView();
    const clickPromise = clickSampleBin();

    expect(await screen.findByText("Розбір файлу...")).toBeInTheDocument();
    expect(getSampleButton()).toBeDisabled();

    resolveParse(null);
    await clickPromise;

    expect(screen.queryByText("Розбір файлу...")).not.toBeInTheDocument();
  });

  it("surfaces a parse error instead of leaving it unhandled when the worker call throws", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    vi.mocked(getCoreWorker).mockReturnValueOnce({
      buildFlightMapDataFromBin: () => Promise.reject(new Error("boom")),
    } as unknown as ReturnType<typeof getCoreWorker>);

    const { clickSampleBin } = getView();
    await clickSampleBin();

    expect(await screen.findByText(/Помилка розбору: boom/)).toBeInTheDocument();
  });

  it("loads the sample flight and creates track/marker entities on the mocked viewer", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { clickSampleBin, getLastViewer } = getView();

    await clickSampleBin();

    // The sample flight always produces a GCS track + an animated aircraft marker, both
    // added via viewer.entities.add() - proving the loaded data actually reached the
    // (mocked) viewer.
    const viewerInstance = getLastViewer();
    expect(viewerInstance).toBeDefined();
    await vi.waitFor(() => expect(viewerInstance!.entities.add).toHaveBeenCalled());
  });
});
