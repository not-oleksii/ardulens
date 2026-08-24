import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PositionTelemetry } from "../../../stores/mavlinkTelemetryStore/types";
import { LiveMapSection } from "../LiveMapSection";

// Same reasoning/mocking approach as CesiumMapView.test.tsx: Viewer/Terrain/
// sampleTerrainMostDetailed/ScreenSpaceEventHandler do real WebGL/network/canvas work jsdom
// can't provide, so only those are replaced - Cartesian3/Cartographic/Math.toDegrees/Color/
// ConstantPositionProperty/ConstantProperty/CallbackProperty stay real (pure math/data classes),
// so the click-to-guided-command handlers' own lat/lon conversion is exercised for real.
const { MockViewer, MockScreenSpaceEventHandler, viewerInstances, registeredClickHandlers } = vi.hoisted(() => {
  class MockEntity {
    position: unknown;
    billboard: { rotation: unknown } | undefined;
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
    camera = { flyTo: vi.fn(), pickEllipsoid: vi.fn() };
    scene = { canvas: {}, globe: { ellipsoid: {} } };
    terrainProvider = {};
    destroy = vi.fn();
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
    sampleTerrainMostDetailed: () => Promise.resolve([{ height: 100 }]),
  };
});

const TOKEN_STORAGE_KEY = "ardulens.cesiumIonToken";

function getView(
  position: PositionTelemetry | null,
  headingDeg: number | undefined = undefined,
  opts: { rtlModeNumber?: number | null } = {},
) {
  const user = userEvent.setup();
  const onFlyToHere = vi.fn<(lat: number, lon: number) => void>();
  const onSetHomeHere = vi.fn<(lat: number, lon: number) => void>();
  const onTakeoff = vi.fn<(altitudeM: number) => void>();
  const onRtl = vi.fn<() => void>();
  const rtlModeNumber = opts.rtlModeNumber ?? 6;
  const { rerender } = render(
    <LiveMapSection
      position={position}
      headingDeg={headingDeg}
      rtlModeNumber={rtlModeNumber}
      onFlyToHere={onFlyToHere}
      onSetHomeHere={onSetHomeHere}
      onTakeoff={onTakeoff}
      onRtl={onRtl}
    />,
  );

  const getTokenInput = () => screen.getByPlaceholderText("Вставте сюди свій токен Cesium ion");
  const getSaveButton = () => screen.getByRole("button", { name: "Зберегти" });
  const getMap = () => screen.queryByTestId("live-map");
  const getLastViewer = () => viewerInstances.at(-1);
  const typeToken = (text: string) => user.type(getTokenInput(), text);
  const clickSave = () => user.click(getSaveButton());
  const setPosition = (p: PositionTelemetry | null, h: number | undefined = undefined) =>
    rerender(
      <LiveMapSection
        position={p}
        headingDeg={h}
        rtlModeNumber={rtlModeNumber}
        onFlyToHere={onFlyToHere}
        onSetHomeHere={onSetHomeHere}
        onTakeoff={onTakeoff}
        onRtl={onRtl}
      />,
    );

  return {
    user,
    getTokenInput,
    getSaveButton,
    getMap,
    getLastViewer,
    typeToken,
    clickSave,
    setPosition,
    rerender,
    onFlyToHere,
    onSetHomeHere,
    onTakeoff,
    onRtl,
  };
}

beforeEach(() => {
  localStorage.clear();
  viewerInstances.length = 0;
  registeredClickHandlers.length = 0;
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

  it("shows a tokenless position radar instead of a blank map when no token is saved", () => {
    getView(null);
    expect(screen.getByText("Очікування GPS-фіксації...")).toBeInTheDocument(); // no position yet
    expect(screen.queryByTestId("tokenless-position-radar")).not.toBeInTheDocument();
  });

  it("renders the tokenless radar once a position arrives, with no token saved", () => {
    const { setPosition } = getView(null);
    setPosition({ lat: 50.45, lon: 30.52, relativeAltM: 100, updatedAt: 1 }, 90);
    expect(screen.getByTestId("tokenless-position-radar")).toBeInTheDocument();
    // The very first position is also the radar's own origin, so it's 0m from start.
    expect(screen.getByText("0 м від старту")).toBeInTheDocument();
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

  it("shows the RTL button only when a vehicle family with a known RTL mode number is connected", () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { rerender } = getView(null, undefined, { rtlModeNumber: 6 });
    expect(screen.getByRole("button", { name: "RTL" })).toBeInTheDocument();

    rerender(
      <LiveMapSection
        position={null}
        headingDeg={undefined}
        rtlModeNumber={null}
        onFlyToHere={vi.fn()}
        onSetHomeHere={vi.fn()}
        onTakeoff={vi.fn()}
        onRtl={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "RTL" })).not.toBeInTheDocument();
  });

  it("RTL button calls onRtl", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { user, onRtl } = getView(null);
    await user.click(screen.getByRole("button", { name: "RTL" }));
    expect(onRtl).toHaveBeenCalledTimes(1);
  });

  it("Takeoff sends the entered altitude, ignores a non-positive one", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { user, onTakeoff } = getView(null);

    await user.click(screen.getByRole("button", { name: "Зліт" })); // default "10"
    expect(onTakeoff).toHaveBeenCalledWith(10);

    const altInput = screen.getByLabelText("Висота зльоту (м)");
    await user.clear(altInput);
    await user.type(altInput, "0");
    await user.click(screen.getByRole("button", { name: "Зліт" }));
    expect(onTakeoff).toHaveBeenCalledTimes(1); // still just the one call from above
  });

  it("Fly to here arms on click, sends the clicked lat/lon on the next map click, then disarms", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { user, onFlyToHere, getLastViewer } = getView(null);

    const flyToButton = screen.getByRole("button", { name: "Летіти сюди" });
    await user.click(flyToButton);
    expect(screen.getByText("Натисніть на карту, щоб надіслати команду.")).toBeInTheDocument();

    const viewer = getLastViewer()!;
    const { Cartesian3 } = await import("cesium");
    viewer.camera.pickEllipsoid.mockReturnValue(Cartesian3.fromDegrees(31, 52, 0));
    // The handler is invoked directly (not through a real DOM event testing-library would wrap
    // in act() itself), but it does trigger a React state update (disarming afterward) - act()
    // ensures that's flushed before the DOM assertions below run.
    act(() => {
      registeredClickHandlers[0]!({ position: {} });
    });

    expect(onFlyToHere).toHaveBeenCalledTimes(1);
    const [lat, lon] = onFlyToHere.mock.calls[0]!;
    expect(lat).toBeCloseTo(52, 4);
    expect(lon).toBeCloseTo(31, 4);
    // One-shot - the prompt is gone and a second click sends nothing more.
    expect(screen.queryByText("Натисніть на карту, щоб надіслати команду.")).not.toBeInTheDocument();
    act(() => {
      registeredClickHandlers[0]!({ position: {} });
    });
    expect(onFlyToHere).toHaveBeenCalledTimes(1);
  });

  it("Set home here arms independently of Fly to here - only the most recently armed action fires", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { user, onFlyToHere, onSetHomeHere, getLastViewer } = getView(null);

    await user.click(screen.getByRole("button", { name: "Летіти сюди" }));
    await user.click(screen.getByRole("button", { name: "Встановити дім тут" })); // re-arms to setHome instead

    const viewer = getLastViewer()!;
    const { Cartesian3 } = await import("cesium");
    viewer.camera.pickEllipsoid.mockReturnValue(Cartesian3.fromDegrees(31, 52, 0));
    act(() => {
      registeredClickHandlers[0]!({ position: {} });
    });

    expect(onSetHomeHere).toHaveBeenCalledTimes(1);
    expect(onFlyToHere).not.toHaveBeenCalled();
  });
});
