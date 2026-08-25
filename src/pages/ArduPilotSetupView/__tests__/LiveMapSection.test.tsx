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
    camera = { flyTo: vi.fn(), pickEllipsoid: vi.fn(), getPickRay: vi.fn() };
    scene = { canvas: {}, globe: { ellipsoid: {}, pick: vi.fn() } };
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
  const onFlyToHere = vi.fn<(lat: number, lon: number, altitudeM: number) => void>();
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

  it("right-click opens a popup with Fly-to-here/Set-home-here at the clicked point", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    getView(null);

    const viewer = viewerInstances.at(-1)!;
    const { Cartesian3 } = await import("cesium");
    viewer.camera.pickEllipsoid.mockReturnValue(Cartesian3.fromDegrees(31, 52, 0));
    act(() => {
      registeredClickHandlers[0]!({ position: { x: 120, y: 80 } });
    });

    expect(screen.getByRole("button", { name: "Летіти сюди" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Встановити дім тут" })).toBeInTheDocument();
  });

  it("Fly to here sends the right-clicked lat/lon at the vehicle's current altitude by default, drops a target marker + track line, then closes the popup", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { user, onFlyToHere } = getView({ lat: 50, lon: 30, relativeAltM: 42, updatedAt: 0 });

    const viewer = viewerInstances.at(-1)!;
    const { Cartesian3 } = await import("cesium");
    viewer.camera.pickEllipsoid.mockReturnValue(Cartesian3.fromDegrees(31, 52, 0));
    const entitiesBefore = viewer.entities.add.mock.calls.length;
    act(() => {
      registeredClickHandlers[0]!({ position: { x: 120, y: 80 } });
    });

    // Defaults to the vehicle's own current relative altitude, editable before sending.
    expect(screen.getByLabelText("Висота польоту до точки (м)")).toHaveValue(42);

    await user.click(screen.getByRole("button", { name: "Летіти сюди" }));

    expect(onFlyToHere).toHaveBeenCalledTimes(1);
    const [lat, lon, alt] = onFlyToHere.mock.calls[0]!;
    expect(lat).toBeCloseTo(52, 4);
    expect(lon).toBeCloseTo(31, 4);
    expect(alt).toBe(42);
    // Target marker + track-line entity both added.
    expect(viewer.entities.add.mock.calls.length).toBe(entitiesBefore + 2);
    expect(screen.queryByRole("button", { name: "Летіти сюди" })).not.toBeInTheDocument();
  });

  it("Fly to here sends a user-edited altitude instead of the default", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { user, onFlyToHere } = getView({ lat: 50, lon: 30, relativeAltM: 42, updatedAt: 0 });

    const viewer = viewerInstances.at(-1)!;
    const { Cartesian3 } = await import("cesium");
    viewer.camera.pickEllipsoid.mockReturnValue(Cartesian3.fromDegrees(31, 52, 0));
    act(() => {
      registeredClickHandlers[0]!({ position: { x: 120, y: 80 } });
    });

    const altInput = screen.getByLabelText("Висота польоту до точки (м)");
    await user.clear(altInput);
    await user.type(altInput, "75");
    await user.click(screen.getByRole("button", { name: "Летіти сюди" }));

    expect(onFlyToHere.mock.calls[0]![2]).toBe(75);
  });

  it("Set home here sends the right-clicked lat/lon and drops a home marker", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { user, onSetHomeHere, onFlyToHere } = getView(null);

    const viewer = viewerInstances.at(-1)!;
    const { Cartesian3 } = await import("cesium");
    viewer.camera.pickEllipsoid.mockReturnValue(Cartesian3.fromDegrees(31, 52, 0));
    act(() => {
      registeredClickHandlers[0]!({ position: { x: 120, y: 80 } });
    });

    await user.click(screen.getByRole("button", { name: "Встановити дім тут" }));

    expect(onSetHomeHere).toHaveBeenCalledTimes(1);
    expect(onFlyToHere).not.toHaveBeenCalled();
    const [lat, lon] = onSetHomeHere.mock.calls[0]!;
    expect(lat).toBeCloseTo(52, 4);
    expect(lon).toBeCloseTo(31, 4);
  });

  it("Escape closes the popup without sending any command", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { user, onFlyToHere, onSetHomeHere } = getView(null);

    const viewer = viewerInstances.at(-1)!;
    const { Cartesian3 } = await import("cesium");
    viewer.camera.pickEllipsoid.mockReturnValue(Cartesian3.fromDegrees(31, 52, 0));
    act(() => {
      registeredClickHandlers[0]!({ position: { x: 120, y: 80 } });
    });
    expect(screen.getByRole("button", { name: "Летіти сюди" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: "Летіти сюди" })).not.toBeInTheDocument();
    expect(onFlyToHere).not.toHaveBeenCalled();
    expect(onSetHomeHere).not.toHaveBeenCalled();
  });

  it("does not render a heading label over the connected map", () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    getView(null);
    expect(screen.queryByText("Карта")).not.toBeInTheDocument();
  });
});
