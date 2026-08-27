import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionItemEntry } from "../../../stores/mavlinkMissionStore/types";
import { FencePlanSection } from "../FencePlanSection";

// Same reasoning/mocking approach as MissionPlanSection.test.tsx: only the real WebGL/canvas-
// dependent pieces (Viewer, the screen-space click handler) are replaced - Cartesian3/
// Cartographic/Math.toDegrees stay real (pure math), so the click-to-add-vertex handler's own
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
const NAV_FENCE_POLYGON_VERTEX_INCLUSION = 5001;

function sampleItems(): MissionItemEntry[] {
  return [
    { seq: 0, command: NAV_FENCE_POLYGON_VERTEX_INCLUSION, frame: 0, autocontinue: true, param1: 2, param2: 0, param3: 0, param4: 0, lat: 50.448, lon: 30.52, alt: 0 },
    { seq: 1, command: NAV_FENCE_POLYGON_VERTEX_INCLUSION, frame: 0, autocontinue: true, param1: 2, param2: 0, param3: 0, param4: 0, lat: 50.458, lon: 30.532, alt: 0 },
  ];
}

function getView(items: MissionItemEntry[] = []) {
  const user = userEvent.setup();
  const onSetItems = vi.fn();
  const { rerender } = render(
    <FencePlanSection
      items={items}
      downloadPhase="idle"
      downloadCountExpected={null}
      downloadError={null}
      uploadPhase="idle"
      uploadError={null}
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

describe("FencePlanSection", () => {
  it("shows the empty-state message and no map/table when there are no items and no token", () => {
    getView([]);
    expect(screen.getByText(/Ще немає точок геозони/)).toBeInTheDocument();
    expect(screen.queryByTestId("fence-map")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Вставте сюди свій токен Cesium ion")).toBeInTheDocument();
  });

  it("shows the drawer open by default, with the point count in its handle", () => {
    getView(sampleItems());
    const handle = screen.getByRole("button", { name: /Точки геозони \(2\)/ });
    expect(handle).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses and re-expands the drawer without unmounting the table", async () => {
    const { user } = getView(sampleItems());
    const handle = screen.getByRole("button", { name: /Точки геозони/ });

    await user.click(handle);
    expect(handle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("row")).toHaveLength(3);

    await user.click(handle);
    expect(handle).toHaveAttribute("aria-expanded", "true");
  });

  it("lists fence vertices in the table with editable lat/lon and vertex count", () => {
    getView(sampleItems());
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2 vertices
    expect(within(rows[1]!).getByText("0")).toBeInTheDocument(); // seq
    expect(within(rows[1]!).getByDisplayValue("50.448")).toBeInTheDocument();
    expect(within(rows[1]!).getByDisplayValue("2")).toBeInTheDocument(); // vertex count param1
  });

  it("Add vertex appends a new INCLUSION vertex and recomputes every vertex's count param", async () => {
    const { user, onSetItems } = getView(sampleItems());
    await user.click(screen.getByRole("button", { name: "Додати вершину" }));
    const sent = onSetItems.mock.calls.at(-1)![0] as MissionItemEntry[];
    expect(sent).toHaveLength(3);
    expect(sent.every((i) => i.param1 === 3)).toBe(true);
  });

  it("deleting a vertex removes it, re-sequences the rest, and recomputes the vertex count", async () => {
    const { user, onSetItems } = getView(sampleItems());
    const rows = screen.getAllByRole("row");
    await user.click(within(rows[1]!).getByRole("button", { name: "Видалити" }));
    const sent = onSetItems.mock.calls.at(-1)![0] as MissionItemEntry[];
    expect(sent).toEqual([expect.objectContaining({ seq: 0, param1: 1 })]);
  });

  it("editing a lat input stages the change via onSetItems", () => {
    const { onSetItems } = getView(sampleItems());
    const latInput = screen.getByDisplayValue("50.448");
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
      <FencePlanSection
        items={sampleItems()}
        downloadPhase="idle"
        downloadCountExpected={null}
        downloadError={null}
        uploadPhase="idle"
        uploadError={null}
        onDownload={vi.fn()}
        onUpload={vi.fn()}
        onSetItems={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Надіслати на апарат" })).not.toBeDisabled();
  });

  it("shows download progress text while downloading", () => {
    render(
      <FencePlanSection
        items={[sampleItems()[0]!]}
        downloadPhase="active"
        downloadCountExpected={2}
        downloadError={null}
        uploadPhase="idle"
        uploadError={null}
        onDownload={vi.fn()}
        onUpload={vi.fn()}
        onSetItems={vi.fn()}
      />,
    );
    expect(screen.getByText("Завантаження місії... 1 / 2")).toBeInTheDocument();
  });

  it("shows an upload error message", () => {
    render(
      <FencePlanSection
        items={sampleItems()}
        downloadPhase="idle"
        downloadCountExpected={null}
        downloadError={null}
        uploadPhase="error"
        uploadError="MISSION_ACK: ERROR"
        onDownload={vi.fn()}
        onUpload={vi.fn()}
        onSetItems={vi.fn()}
      />,
    );
    expect(screen.getByText("MISSION_ACK: ERROR")).toBeInTheDocument();
  });

  it("shows the map once a Cesium token is saved, and clicking it adds a vertex at the clicked location", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "test-token");
    const { onSetItems } = getView(sampleItems());
    expect(await screen.findByTestId("fence-map")).toBeInTheDocument();

    const viewer = viewerInstances.at(-1)!;
    const { Cartesian3 } = await import("cesium");
    viewer.camera.pickEllipsoid.mockReturnValue(Cartesian3.fromDegrees(31, 52, 0));

    const clickHandler = registeredClickHandlers[0]!;
    clickHandler({ position: {} });

    const lastCall = onSetItems.mock.calls.at(-1)![0] as MissionItemEntry[];
    const added = lastCall.at(-1)!;
    expect(added.lat).toBeCloseTo(52, 4);
    expect(added.lon).toBeCloseTo(31, 4);
    expect(lastCall.every((i) => i.param1 === 3)).toBe(true);
  });
});
