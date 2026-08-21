import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionItemEntry } from "../../../stores/mavlinkMissionStore/types";
import { MissionPlanSection } from "../MissionPlanSection";

// Same reasoning/mocking approach as LiveMapSection.test.tsx and CesiumMapView.test.tsx: only
// the real WebGL/canvas-dependent pieces (Viewer, the screen-space click handler) are replaced -
// Cartesian3/Cartographic/Math.toDegrees stay real (pure math), so the click-to-add-waypoint
// handler's own lat/lon conversion is exercised for real, not just assumed correct.
const { MockViewer, MockScreenSpaceEventHandler, viewerInstances, registeredClickHandlers } = vi.hoisted(() => {
  const viewerInstances: MockViewer[] = [];
  const registeredClickHandlers: Array<(movement: { position: unknown }) => void> = [];
  class MockViewer {
    entities = { add: vi.fn(), removeAll: vi.fn() };
    camera = { pickEllipsoid: vi.fn() };
    scene = { canvas: {}, globe: { ellipsoid: {} } };
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
  };
});

const TOKEN_STORAGE_KEY = "ardulens.cesiumIonToken";

function sampleItems(): MissionItemEntry[] {
  return [
    { seq: 0, command: 16, frame: 3, autocontinue: true, param1: 0, param2: 0, param3: 0, param4: 0, lat: 50.4501, lon: 30.5234, alt: 0 },
    { seq: 1, command: 20, frame: 3, autocontinue: true, param1: 0, param2: 0, param3: 0, param4: 0, lat: 0, lon: 0, alt: 0 },
  ];
}

function getView(items: MissionItemEntry[] = []) {
  const user = userEvent.setup();
  const onSetItems = vi.fn();
  const { rerender } = render(
    <MissionPlanSection
      items={items}
      downloadPhase="idle"
      downloadCountExpected={null}
      downloadError={null}
      uploadPhase="idle"
      uploadError={null}
      vehiclePosition={null}
      onDownload={vi.fn()}
      onUpload={vi.fn()}
      onSetItems={onSetItems}
    />,
  );
  return { user, onSetItems, rerender };
}

beforeEach(() => {
  localStorage.clear();
  viewerInstances.length = 0;
  registeredClickHandlers.length = 0;
});

afterEach(() => {
  localStorage.clear();
});

describe("MissionPlanSection", () => {
  it("shows the empty-state message and no map/table when there are no items and no token", () => {
    getView([]);
    expect(screen.getByText(/Ще немає точок місії/)).toBeInTheDocument();
    expect(screen.queryByTestId("mission-map")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Вставте сюди свій токен Cesium ion")).toBeInTheDocument();
  });

  it("shows the waypoints drawer open by default, with the item count in its handle", () => {
    getView(sampleItems());
    const handle = screen.getByRole("button", { name: /Точки маршруту \(2\)/ });
    expect(handle).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses and re-expands the waypoints drawer without unmounting the table", async () => {
    const { user } = getView(sampleItems());
    const handle = screen.getByRole("button", { name: /Точки маршруту/ });

    await user.click(handle);
    expect(handle).toHaveAttribute("aria-expanded", "false");
    // Still in the DOM (a real slide transition, not a mount/unmount) - just visually
    // translated out of view via CSS, which jsdom doesn't compute layout for anyway.
    expect(screen.getAllByRole("row")).toHaveLength(3);

    await user.click(handle);
    expect(handle).toHaveAttribute("aria-expanded", "true");
  });

  it("lists mission items in the table with editable lat/lon/alt", () => {
    getView(sampleItems());
    const rows = screen.getAllByRole("row");
    // header + 2 item rows
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText("0")).toBeInTheDocument(); // seq
    expect(within(rows[1]!).getByDisplayValue("50.4501")).toBeInTheDocument();
  });

  it("shows '-' instead of position/param inputs for a command that doesn't use them (e.g. Return to Launch)", () => {
    getView(sampleItems());
    const rows = screen.getAllByRole("row");
    const rtlRow = rows[2]!; // seq 1, NAV_RETURN_TO_LAUNCH
    expect(within(rtlRow).getAllByText("-").length).toBeGreaterThan(0);
  });

  it("Add waypoint appends a new NAV_WAYPOINT row based on the last item's position", async () => {
    const { user, onSetItems } = getView(sampleItems());
    await user.click(screen.getByRole("button", { name: "Додати точку" }));
    expect(onSetItems).toHaveBeenCalledWith([
      ...sampleItems(),
      expect.objectContaining({ seq: 2, command: 16, lat: 0, lon: 0 }),
    ]);
  });

  it("deleting a row removes it and re-sequences the rest", async () => {
    const { user, onSetItems } = getView(sampleItems());
    const rows = screen.getAllByRole("row");
    await user.click(within(rows[1]!).getByRole("button", { name: "Видалити" }));
    expect(onSetItems).toHaveBeenCalledWith([expect.objectContaining({ seq: 0, command: 20 })]);
  });

  it("editing a lat input stages the change via onSetItems", () => {
    const { onSetItems } = getView(sampleItems());
    const latInput = screen.getByDisplayValue("50.4501");
    // A controlled input bound directly to the `items` prop - fireEvent.change (one shot) rather
    // than user.type (per-keystroke) since the prop never actually updates mid-test (onSetItems
    // is a mock, not wired back into a real re-render), so per-keystroke typing would fight the
    // input's own reverted-to-original-value controlled state between characters.
    fireEvent.change(latInput, { target: { value: "51" } });
    expect(onSetItems).toHaveBeenLastCalledWith([
      expect.objectContaining({ seq: 0, lat: 51 }),
      expect.objectContaining({ seq: 1 }),
    ]);
  });

  it("Clear all wipes every item", async () => {
    const { user, onSetItems } = getView(sampleItems());
    await user.click(screen.getByRole("button", { name: "Очистити все" }));
    expect(onSetItems).toHaveBeenCalledWith([]);
  });

  it("Upload is disabled with no items, enabled once items exist", () => {
    const { rerender } = getView([]);
    expect(screen.getByRole("button", { name: "Надіслати на апарат" })).toBeDisabled();
    rerender(
      <MissionPlanSection
        items={sampleItems()}
        downloadPhase="idle"
        downloadCountExpected={null}
        downloadError={null}
        uploadPhase="idle"
        uploadError={null}
        vehiclePosition={null}
        onDownload={vi.fn()}
        onUpload={vi.fn()}
        onSetItems={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Надіслати на апарат" })).not.toBeDisabled();
  });

  it("shows download progress text while downloading", () => {
    render(
      <MissionPlanSection
        items={[sampleItems()[0]!]}
        downloadPhase="active"
        downloadCountExpected={2}
        downloadError={null}
        uploadPhase="idle"
        uploadError={null}
        vehiclePosition={null}
        onDownload={vi.fn()}
        onUpload={vi.fn()}
        onSetItems={vi.fn()}
      />,
    );
    expect(screen.getByText("Завантаження місії... 1 / 2")).toBeInTheDocument();
  });

  it("shows an upload error message", () => {
    render(
      <MissionPlanSection
        items={sampleItems()}
        downloadPhase="idle"
        downloadCountExpected={null}
        downloadError={null}
        uploadPhase="error"
        uploadError="MISSION_ACK: ERROR"
        vehiclePosition={null}
        onDownload={vi.fn()}
        onUpload={vi.fn()}
        onSetItems={vi.fn()}
      />,
    );
    expect(screen.getByText("MISSION_ACK: ERROR")).toBeInTheDocument();
  });

  it("Save file downloads a QGC WPL 110 formatted .waypoints file", async () => {
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });
    const { user } = getView(sampleItems());
    await user.click(screen.getByRole("button", { name: "Зберегти файл" }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("shows the map once a Cesium token is saved, and clicking it adds a waypoint at the clicked location", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { onSetItems } = getView(sampleItems());
    expect(await screen.findByTestId("mission-map")).toBeInTheDocument();

    const viewer = viewerInstances.at(-1)!;
    // A real Cartesian3 for a known lat/lon (52, 31), matching pickEllipsoid's real signature.
    const { Cartesian3 } = await import("cesium");
    viewer.camera.pickEllipsoid.mockReturnValue(Cartesian3.fromDegrees(31, 52, 0));

    const clickHandler = registeredClickHandlers[0]!;
    clickHandler({ position: {} });

    const lastCall = onSetItems.mock.calls.at(-1)![0] as MissionItemEntry[];
    const added = lastCall.at(-1)!;
    expect(added.lat).toBeCloseTo(52, 4);
    expect(added.lon).toBeCloseTo(31, 4);
  });
});
