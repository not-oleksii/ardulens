import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RawLogResult } from "../../../analysis/raw-log/types";
import { buildRawLog } from "../../../analysis/raw-log/raw-log";
import { FlightBinBuilder } from "../../../builders/FlightBinBuilder/FlightBinBuilder";
import { SkylogFileBuilder } from "../../../builders/SkylogFileBuilder/SkylogFileBuilder";
import { getCoreWorker } from "../../../services/coreWorkerClient/coreWorkerClient";
import { useFileStore } from "../../../stores/fileStore/fileStore";
import { useUiStore } from "../../../stores/uiStore/uiStore";
import { GraphsView } from "../GraphsView";

vi.mock("../../../services/coreWorkerClient/coreWorkerClient", async () => {
  const actual = await vi.importActual<typeof import("../../../services/coreWorkerClient/coreWorkerClient")>(
    "../../../services/coreWorkerClient/coreWorkerClient",
  );
  return { getCoreWorker: vi.fn(actual.getCoreWorker) };
});

const { MockUplot } = vi.hoisted(() => {
  const MockUplot = vi.fn().mockImplementation(function mockUplotCtor(this: Record<string, unknown>) {
    this["destroy"] = vi.fn();
    this["setScale"] = vi.fn();
    this["setSize"] = vi.fn();
  });
  (MockUplot as unknown as { join: (tables: unknown[][]) => unknown }).join = vi.fn((tables: unknown[][]) => [
    "x",
    ...tables.map((t) => t[1]),
  ]);
  return { MockUplot };
});
vi.mock("uplot", () => ({ default: MockUplot }));

function loadFile(name: string, buf: ArrayBuffer) {
  useFileStore.getState().setFile({ name, buf });
}

function sampleBinBuf() {
  return new FlightBinBuilder().withVoltageCurve(25.2, 22.4, 23.0).build();
}

function sampleSkylogBuf() {
  return new SkylogFileBuilder().addBoard({ board: 3570 }).build();
}

function getView() {
  const user = userEvent.setup();
  render(<GraphsView />);

  const getParamSearchInput = () => screen.getByPlaceholderText("Пошук параметрів...");

  const clickButton = (name: string | RegExp) => user.click(screen.getByRole("button", { name }));
  const typeParamSearch = (text: string) => user.type(getParamSearchInput(), text);
  const hoverButton = (name: string | RegExp) => user.hover(screen.getByRole("button", { name }));

  return { user, getParamSearchInput, clickButton, typeParamSearch, hoverButton };
}

afterEach(() => {
  useFileStore.getState().clearFile();
  useUiStore.getState().setPendingPresetKey(null);
  vi.mocked(getCoreWorker).mockRestore();
});

describe("GraphsView", () => {
  it("renders the heading and description", () => {
    getView();
    expect(screen.getByRole("heading", { name: "Графіки" })).toBeInTheDocument();
  });

  it("loading a sample .bin shows plots setup, presets, and the parameter tree, with an empty chart placeholder", async () => {
    loadFile("sample-flight.bin", sampleBinBuf());
    getView();

    expect(await screen.findByText("Ще не обрано жодного параметра - оберіть пресет або параметр нижче.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Батарея (напруга і струм)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Орієнтація" })).toBeInTheDocument();
    expect(screen.getByTestId("timeline-chart-empty")).toBeInTheDocument();
  });

  it("shows a whole-file findings badge summarizing anomalies across the flights in the loaded file", async () => {
    // The sample .bin's voltage curve (25.2V -> 22.4V under load) is an ~11% sag,
    // above the advisor's warning threshold.
    loadFile("sample-flight.bin", sampleBinBuf());
    const { user } = getView();

    const badge = await screen.findByRole("button", { name: "Знайдено зауважень: 1 - натисніть для деталей" });
    await user.click(badge);
    expect(await screen.findByText(/Помітна просадка напруги під газом/)).toBeInTheDocument();
  });

  it("shows a quiet 'no issues' indicator when the loaded file's flights are clean", async () => {
    loadFile("sample-log.skylog", sampleSkylogBuf());
    getView();

    await screen.findByRole("button", { name: "Телеметрія" });
    expect(screen.getByText("Проблем не знайдено")).toBeInTheDocument();
  });

  it("shows a loading spinner while a file is being derived", async () => {
    let resolveBuild!: (value: ReturnType<typeof buildRawLog>) => void;
    const pending = new Promise<ReturnType<typeof buildRawLog>>((resolve) => {
      resolveBuild = resolve;
    });
    vi.mocked(getCoreWorker).mockReturnValueOnce({
      buildRawLog: () => pending,
      parseFile: () => Promise.resolve({ flights: [], boards: [], fmt: "bin" }),
    } as unknown as ReturnType<typeof getCoreWorker>);
    loadFile("sample-flight.bin", sampleBinBuf());

    getView();

    expect(await screen.findByText("Розбір файлу...")).toBeInTheDocument();

    resolveBuild(buildRawLog("sample.bin", new FlightBinBuilder().build()));

    expect(await screen.findByTestId("timeline-chart-empty")).toBeInTheDocument();
    expect(screen.queryByText("Розбір файлу...")).not.toBeInTheDocument();
  });

  it("clicking a preset adds all its params to Plots Setup and renders the chart", async () => {
    loadFile("sample-flight.bin", sampleBinBuf());
    const { clickButton } = getView();
    await screen.findByRole("button", { name: "Батарея (напруга і струм)" });

    await clickButton("Батарея (напруга і струм)");

    expect(screen.getByText("BAT.Volt")).toBeInTheDocument();
    expect(screen.getByText("BAT.Curr")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-chart")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-chart-empty")).not.toBeInTheDocument();
  });

  it("toggles an individual parameter on and off via the category tree", async () => {
    loadFile("sample-flight.bin", sampleBinBuf());
    const { clickButton } = getView();
    await screen.findByRole("button", { name: "Орієнтація" });

    await clickButton("Орієнтація");
    await clickButton("ATT.Roll");

    expect(within(screen.getByRole("list")).getByText("ATT.Roll")).toBeInTheDocument();

    await clickButton("ATT.Roll");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("removes a plotted parameter via its trash button", async () => {
    loadFile("sample-flight.bin", sampleBinBuf());
    const { clickButton, user } = getView();
    await user.click(await screen.findByRole("button", { name: "Швидкість польоту" }));
    expect(screen.getByText("ARSP.Airspeed")).toBeInTheDocument();

    await clickButton("Прибрати ARSP.Airspeed з графіка");

    expect(screen.queryByText("ARSP.Airspeed")).not.toBeInTheDocument();
  });

  it("clears every plotted parameter with the reset button", async () => {
    loadFile("sample-flight.bin", sampleBinBuf());
    const { clickButton, user } = getView();
    await user.click(await screen.findByRole("button", { name: "Батарея (напруга і струм)" }));
    expect(screen.getByText("BAT.Volt")).toBeInTheDocument();

    await clickButton("Очистити всі графіки");

    expect(screen.queryByText("BAT.Volt")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline-chart-empty")).toBeInTheDocument();
  });

  it("loading a sample .skylog only offers its fixed telemetry fields and matching presets", async () => {
    loadFile("sample-log.skylog", sampleSkylogBuf());
    getView();

    expect(await screen.findByRole("button", { name: "Телеметрія" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Батарея (напруга і струм)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Орієнтація (крен/тангаж/рискання)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Канали пульта (RC)" })).not.toBeInTheDocument();
  });

  it("filters the individual-parameter tree by search text and auto-expands matching categories", async () => {
    loadFile("sample-flight.bin", sampleBinBuf());
    const { typeParamSearch } = getView();
    await screen.findByRole("button", { name: "Орієнтація" });

    await typeParamSearch("Roll");

    // The Attitude category auto-expands and shows only the matching param...
    expect(screen.getByRole("button", { name: "ATT.Roll" })).toBeInTheDocument();
    // ...while categories with no match (e.g. Power) disappear entirely.
    expect(screen.queryByRole("button", { name: "Живлення" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ATT.Pitch" })).not.toBeInTheDocument();
  });

  it("shows a no-matches message when the parameter search finds nothing", async () => {
    loadFile("sample-flight.bin", sampleBinBuf());
    const { typeParamSearch } = getView();
    await screen.findByRole("button", { name: "Орієнтація" });

    await typeParamSearch("zzz-no-such-param");

    expect(screen.getByText("Немає параметрів за цим запитом.")).toBeInTheDocument();
  });

  it("shows a description and a Read More link when hovering a documented parameter", async () => {
    loadFile("sample-flight.bin", sampleBinBuf());
    const { user, hoverButton } = getView();
    await user.click(await screen.findByRole("button", { name: "Орієнтація" }));

    await hoverButton("ATT.Roll");

    expect(await screen.findByText(/roll/i)).toBeInTheDocument();
    const link = await screen.findByRole("link", { name: "Детальніше →" });
    expect(link).toHaveAttribute("href", "https://ardupilot.org/plane/docs/logmessages.html#att");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows a description without a Read More link for .skylog's synthesized telemetry fields", async () => {
    loadFile("sample-log.skylog", sampleSkylogBuf());
    const { user, hoverButton } = getView();
    await user.click(await screen.findByRole("button", { name: "Телеметрія" }));

    await hoverButton("telemetry.voltage");

    expect(await screen.findByText(/voltage/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Детальніше →" })).not.toBeInTheDocument();
  });

  it("surfaces the parser's error for a skylog missing -extended_log", async () => {
    loadFile("raw.skylog", new SkylogFileBuilder().addBoard({ board: 1001 }).withoutExtendedLog().build());
    getView();

    expect(await screen.findByText(/Скористайтесь \.bin/)).toBeInTheDocument();
  });

  it("auto-applies a preset deep-linked in via uiStore.pendingPresetKey (PID Tune's 'View in Graphs'), then clears it", async () => {
    const rateLog: RawLogResult = {
      fmt: "bin",
      timeRangeMs: [0, 1000],
      modeSegments: [],
      categories: [{ key: "other", params: [{ key: "RATE.RDes", label: "RATE.RDes" }, { key: "RATE.R", label: "RATE.R" }] }],
      series: {
        "RATE.RDes": [{ t: 0, v: 0 }],
        "RATE.R": [{ t: 0, v: 0 }],
      },
    };
    vi.mocked(getCoreWorker).mockReturnValueOnce({
      buildRawLog: () => Promise.resolve(rateLog),
      parseFile: () => Promise.resolve({ flights: [], boards: [], fmt: "bin" }),
    } as unknown as ReturnType<typeof getCoreWorker>);
    loadFile("sample-flight.bin", sampleBinBuf());
    useUiStore.getState().setPendingPresetKey("pidRoll");

    getView();

    expect(await screen.findByText("RATE.RDes")).toBeInTheDocument();
    expect(screen.getByText("RATE.R")).toBeInTheDocument();
    expect(useUiStore.getState().pendingPresetKey).toBeNull();
  });

  it("resets plots/search/open-categories when a different file is loaded", async () => {
    loadFile("sample-flight.bin", sampleBinBuf());
    const { clickButton, typeParamSearch, getParamSearchInput } = getView();
    await screen.findByRole("button", { name: "Батарея (напруга і струм)" });
    await clickButton("Батарея (напруга і струм)");
    await typeParamSearch("Roll");
    expect(screen.getByText("BAT.Volt")).toBeInTheDocument();

    loadFile("sample-log.skylog", sampleSkylogBuf());

    await screen.findByRole("button", { name: "Телеметрія" });
    expect(screen.queryByText("BAT.Volt")).not.toBeInTheDocument();
    expect(getParamSearchInput()).toHaveValue("");
  });
});
