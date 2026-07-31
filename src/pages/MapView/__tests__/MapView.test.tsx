import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MapView } from "../MapView";

interface MockLayer {
  layout: Record<string, unknown>;
}
interface MockSource {
  data: unknown;
  setData: (d: unknown) => void;
}

const { MockMap, mapInstances } = vi.hoisted(() => {
  class MockMapImpl {
    sources: Record<string, MockSource> = {};
    layers: Record<string, MockLayer> = {};
    styleLoadCb: (() => void) | null = null;

    constructor(_opts: unknown) {
      mapInstancesRef.push(this);
    }
    addControl() {
      /* no-op */
    }
    once(event: string, cb: () => void) {
      if (event === "load") queueMicrotask(cb);
    }
    on(event: string, cb: () => void) {
      if (event === "style.load") this.styleLoadCb = cb;
    }
    remove() {
      /* no-op */
    }
    setStyle() {
      /* no-op */
    }
    isStyleLoaded() {
      return true;
    }
    getSource(id: string) {
      return this.sources[id];
    }
    addSource(id: string, source: { data: unknown }) {
      this.sources[id] = {
        data: source.data,
        setData: (d: unknown) => {
          this.sources[id]!.data = d;
        },
      };
    }
    addLayer(layer: { id: string; layout?: Record<string, unknown> }) {
      this.layers[layer.id] = { layout: layer.layout ?? {} };
    }
    setLayoutProperty(id: string, prop: string, value: unknown) {
      this.layers[id] ??= { layout: {} };
      this.layers[id].layout[prop] = value;
    }
    fitBounds() {
      /* no-op */
    }
    /** Mimics what a real setStyle() call does: wipes sources/layers, then fires
     * "style.load" once the new style is parsed - used to reproduce the race where the
     * blank-style fallback fires *after* the real style already loaded and got data. */
    simulateStyleSwap() {
      this.sources = {};
      this.layers = {};
      this.styleLoadCb?.();
    }
  }
  const mapInstancesRef: MockMapImpl[] = [];
  return { MockMap: MockMapImpl, mapInstances: mapInstancesRef };
});

vi.mock("maplibre-gl", () => ({
  MapLibreMap: MockMap,
  NavigationControl: class {},
  setWorkerUrl: vi.fn(),
}));

function latestMap() {
  return mapInstances[mapInstances.length - 1]!;
}

describe("MapView", () => {
  it("renders the heading and description", () => {
    render(<MapView />);
    expect(screen.getByRole("heading", { name: "Карта" })).toBeInTheDocument();
  });

  it("shows the legend with every track checked by default", () => {
    render(<MapView />);
    expect(screen.getByLabelText("Трек GCS (злита позиція)")).toBeChecked();
    expect(screen.getByLabelText("Сирий трек GPS")).toBeChecked();
    expect(screen.getByLabelText("Очищений трек GPS")).toBeChecked();
    expect(screen.getByLabelText("Зони втрати GPS / спуфінгу")).toBeChecked();
  });

  it("loading the sample .bin populates the map's track and GPS-loss sources", async () => {
    const user = userEvent.setup();
    render(<MapView />);

    await user.click(screen.getByRole("button", { name: "Приклад .bin" }));

    await waitFor(() => {
      const map = latestMap();
      const gcs = map.sources["flight-map-gcs-track"]?.data as GeoJSON.Feature<GeoJSON.LineString>;
      expect(gcs.geometry.coordinates.length).toBeGreaterThan(0);
      const loss = map.sources["flight-map-gps-loss"]?.data as GeoJSON.FeatureCollection;
      expect(loss.features.length).toBeGreaterThan(0);
    });
  });

  it("re-syncs track data after a style swap that happens after the map was already ready", async () => {
    // Regression test: a real MapLibre map can fire "style.load" again well after the
    // original style succeeded (e.g. the blank-style fallback firing because
    // isStyleLoaded() was still momentarily false for an unrelated reason). setStyle()
    // wipes all sources/layers, so if the app only re-pushed data in reaction to a
    // mapReady state *transition* (false -> true), a second style-load with mapReady
    // already true would leave the freshly-recreated sources empty forever.
    const user = userEvent.setup();
    render(<MapView />);
    await user.click(screen.getByRole("button", { name: "Приклад .bin" }));
    await waitFor(() => {
      const gcs = latestMap().sources["flight-map-gcs-track"]?.data as GeoJSON.Feature<GeoJSON.LineString>;
      expect(gcs.geometry.coordinates.length).toBeGreaterThan(0);
    });

    latestMap().simulateStyleSwap();

    await waitFor(() => {
      const gcs = latestMap().sources["flight-map-gcs-track"]?.data as GeoJSON.Feature<GeoJSON.LineString>;
      expect(gcs.geometry.coordinates.length).toBeGreaterThan(0);
    });
  });

  it("unchecking a track hides its map layer", async () => {
    const user = userEvent.setup();
    render(<MapView />);
    await user.click(screen.getByRole("button", { name: "Приклад .bin" }));
    await waitFor(() => {
      expect(latestMap().layers["flight-map-gps-track-layer"]).toBeDefined();
    });

    await user.click(screen.getByLabelText("Сирий трек GPS"));

    await waitFor(() => {
      expect(latestMap().layers["flight-map-gps-track-layer"]!.layout["visibility"]).toBe("none");
    });
  });
});
