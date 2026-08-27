import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionItemEntry } from "../../../stores/mavlinkMissionStore/types";
import { RallyPlanSection } from "../RallyPlanSection";

// Same reasoning/mocking approach as MissionPlanSection.test.tsx: only the real WebGL/canvas-
// dependent pieces (Viewer, the screen-space click handler) are replaced - Cartesian3/
// Cartographic/Math.toDegrees stay real (pure math), so the click-to-add-point handler's own
// lat/lon conversion is exercised for real, not just assumed correct.
const { MockViewer, MockScreenSpaceEventHandler, viewerInstances, registeredClickHandlers } = vi.hoisted(() => {
  const viewerInstances: MockViewer[] = [];
  const registeredClickHandlers: Array<(movement: { position: unknown }) => void> = [];
  class MockViewer {
    entities = { add: vi.fn(), removeAll: vi.fn() };
    camera = { pickEllipsoid: vi.fn(), getPickRay: vi.fn() };
    scene = { canvas: {}, globe: { ellipsoid: {}, pick: vi.fn() } };
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
const NAV_RALLY_POINT = 5100;

function sampleItems(): MissionItemEntry[] {
  return [
    { seq: 0, command: NAV_RALLY_POINT, frame: 3, autocontinue: true, param1: 0, param2: 0, param3: 0, param4: 0, lat: 50.451, lon: 30.518, alt: 30 },
    { seq: 1, command: NAV_RALLY_POINT, frame: 3, autocontinue: true, param1: 0, param2: 0, param3: 0, param4: 0, lat: 50.455, lon: 30.53, alt: 30 },
  ];
}

function getView(items: MissionItemEntry[] = []) {
  const user = userEvent.setup();
  const onSetItems = vi.fn();
  const { rerender } = render(
    <RallyPlanSection
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

describe("RallyPlanSection", () => {
  it("shows the empty-state message and no map/table when there are no items and no token", () => {
    getView([]);
    expect(screen.getByText(/Ще немає точок повернення/)).toBeInTheDocument();
    expect(screen.queryByTestId("rally-map")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Вставте сюди свій токен Cesium ion")).toBeInTheDocument();
  });

  it("shows the drawer open by default, with the point count in its handle", () => {
    getView(sampleItems());
    const handle = screen.getByRole("button", { name: /Точки повернення \(2\)/ });
    expect(handle).toHaveAttribute("aria-expanded", "true");
  });

  it("lists rally points in the table with editable lat/lon/alt", () => {
    getView(sampleItems());
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2 points
    expect(within(rows[1]!).getByText("0")).toBeInTheDocument(); // seq
    expect(within(rows[1]!).getByDisplayValue("50.451")).toBeInTheDocument();
    expect(within(rows[1]!).getByDisplayValue("30")).toBeInTheDocument(); // alt
  });

  it("Add point appends a new rally point based on the last item's position", async () => {
    const { user, onSetItems } = getView(sampleItems());
    await user.click(screen.getByRole("button", { name: "Додати точку" }));
    expect(onSetItems).toHaveBeenCalledWith([
      ...sampleItems(),
      expect.objectContaining({ seq: 2, command: NAV_RALLY_POINT, lat: 50.455, lon: 30.53, alt: 30 }),
    ]);
  });

  it("deleting a point removes it and re-sequences the rest", async () => {
    const { user, onSetItems } = getView(sampleItems());
    const rows = screen.getAllByRole("row");
    await user.click(within(rows[1]!).getByRole("button", { name: "Видалити" }));
    expect(onSetItems).toHaveBeenCalledWith([expect.objectContaining({ seq: 0, lat: 50.455, lon: 30.53 })]);
  });

  it("editing a lat input stages the change via onSetItems", () => {
    const { onSetItems } = getView(sampleItems());
    const latInput = screen.getByDisplayValue("50.451");
    fireEvent.change(latInput, { target: { value: "51" } });
    expect(onSetItems).toHaveBeenLastCalledWith([
      expect.objectContaining({ seq: 0, lat: 51 }),
      expect.objectContaining({ seq: 1 }),
    ]);
  });

  it("Clear all asks for confirmation before wiping every point", async () => {
    const { user, onSetItems } = getView(sampleItems());
    await user.click(screen.getByRole("button", { name: "Очистити все" }));

    expect(onSetItems).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Очистити все" }));

    expect(onSetItems).toHaveBeenCalledWith([]);
  });

  it("Upload is disabled with no items, enabled once items exist", () => {
    const { rerender } = getView([]);
    expect(screen.getByRole("button", { name: "Надіслати на апарат" })).toBeDisabled();
    rerender(
      <RallyPlanSection
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

  it("shows an upload error message", () => {
    render(
      <RallyPlanSection
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

  it("shows the map once a Cesium token is saved, and clicking it adds a point at the clicked location", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { onSetItems } = getView(sampleItems());
    expect(await screen.findByTestId("rally-map")).toBeInTheDocument();

    const viewer = viewerInstances.at(-1)!;
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
