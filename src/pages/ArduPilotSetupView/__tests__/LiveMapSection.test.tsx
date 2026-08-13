import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PositionTelemetry } from "../../../stores/mavlinkTelemetryStore/types";
import { LiveMapSection } from "../LiveMapSection";

// Same reasoning/mocking approach as CesiumMapView.test.tsx: Viewer/Terrain/
// sampleTerrainMostDetailed do real WebGL/network work jsdom can't provide, so only those are
// replaced - Cartesian3, Color, ConstantPositionProperty, ConstantProperty, CallbackProperty
// stay real (pure math/data classes).
const { MockViewer, viewerInstances } = vi.hoisted(() => {
  class MockEntity {
    position: unknown;
    billboard: { rotation: unknown } | undefined;
    constructor(opts: Record<string, unknown>) {
      Object.assign(this, opts);
    }
  }
  const viewerInstances: MockViewer[] = [];
  class MockViewer {
    entities = {
      add: vi.fn((opts: Record<string, unknown>) => new MockEntity(opts)),
      remove: vi.fn(),
    };
    camera = { flyTo: vi.fn() };
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

const TOKEN_STORAGE_KEY = "ardulens.cesiumIonToken";

function getView(position: PositionTelemetry | null, headingDeg: number | undefined = undefined) {
  const user = userEvent.setup();
  const { rerender } = render(<LiveMapSection position={position} headingDeg={headingDeg} />);

  const getTokenInput = () => screen.getByPlaceholderText("Вставте сюди свій токен Cesium ion");
  const getSaveButton = () => screen.getByRole("button", { name: "Зберегти" });
  const getMap = () => screen.queryByTestId("live-map");
  const getLastViewer = () => viewerInstances.at(-1);
  const typeToken = (text: string) => user.type(getTokenInput(), text);
  const clickSave = () => user.click(getSaveButton());
  const setPosition = (p: PositionTelemetry | null, h: number | undefined = undefined) =>
    rerender(<LiveMapSection position={p} headingDeg={h} />);

  return { user, getTokenInput, getSaveButton, getMap, getLastViewer, typeToken, clickSave, setPosition, rerender };
}

beforeEach(() => {
  localStorage.clear();
  viewerInstances.length = 0;
});

afterEach(() => {
  localStorage.clear();
});

describe("LiveMapSection", () => {
  it("shows the token entry screen when no token is saved", () => {
    const { getTokenInput, getMap } = getView(null);
    expect(getTokenInput()).toBeInTheDocument();
    expect(getMap()).not.toBeInTheDocument();
  });

  it("saves a token via the input and reveals the map container", async () => {
    const { typeToken, clickSave, getMap } = getView(null);
    await typeToken("test-token");
    await clickSave();
    expect(getMap()).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe("test-token");
  });

  it("shows a no-fix message before any position arrives, once a token is set", () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    getView(null);
    expect(screen.getByText("Очікування GPS-фіксації...")).toBeInTheDocument();
  });

  it("creates a marker entity and flies the camera once a position arrives, and updates the same entity on the next position instead of adding a new one", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { getLastViewer, setPosition } = getView(null);

    setPosition({ lat: 50.45, lon: 30.52, relativeAltM: 100, updatedAt: 1 }, 90);
    const viewer = getLastViewer()!;
    await vi.waitFor(() => expect(viewer.entities.add).toHaveBeenCalledTimes(2)); // marker + trail polyline
    expect(viewer.camera.flyTo).toHaveBeenCalledTimes(1);

    setPosition({ lat: 50.46, lon: 30.53, relativeAltM: 110, updatedAt: 2 }, 95);
    await vi.waitFor(() => {
      // Position updates in place (no new entity), camera does NOT re-fly on every update.
      expect(viewer.entities.add).toHaveBeenCalledTimes(2);
      expect(viewer.camera.flyTo).toHaveBeenCalledTimes(1);
    });
  });

  it("Recenter re-flies the camera to the last known position", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { getLastViewer, setPosition, user } = getView(null);

    setPosition({ lat: 50.45, lon: 30.52, relativeAltM: 100, updatedAt: 1 }, 0);
    const viewer = getLastViewer()!;
    await vi.waitFor(() => expect(viewer.camera.flyTo).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Центрувати" }));
    expect(viewer.camera.flyTo).toHaveBeenCalledTimes(2);
  });
});
