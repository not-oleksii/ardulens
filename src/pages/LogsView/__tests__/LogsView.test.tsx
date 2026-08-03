import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlightBinBuilder } from "../../../builders/FlightBinBuilder/FlightBinBuilder";
import { SkylogFileBuilder } from "../../../builders/SkylogFileBuilder/SkylogFileBuilder";
import i18n from "../../../i18n/i18n";
import { copyText } from "../../../services/clipboard/clipboard";
import { getCoreWorker } from "../../../services/coreWorkerClient/coreWorkerClient";
import { useFileStore } from "../../../stores/fileStore/fileStore";
import { LogsView } from "../LogsView";

vi.mock("../../../services/clipboard/clipboard", () => ({ copyText: vi.fn().mockResolvedValue(undefined) }));
const copyTextMock = vi.mocked(copyText);

vi.mock("../../../services/coreWorkerClient/coreWorkerClient", async () => {
  const actual = await vi.importActual<typeof import("../../../services/coreWorkerClient/coreWorkerClient")>(
    "../../../services/coreWorkerClient/coreWorkerClient",
  );
  return { getCoreWorker: vi.fn(actual.getCoreWorker) };
});

function loadFile(name: string, buf: ArrayBuffer) {
  useFileStore.getState().setFile({ name, buf });
}

function sampleBinBuf() {
  return new FlightBinBuilder().withVoltageCurve(25.2, 22.4, 23.0).withGpsTeleports(4).build();
}

function sampleSkylogBuf() {
  return new SkylogFileBuilder()
    .addBoard({ board: 3570, takeoffVoltage: 25.1, landingVoltage: 23.6 })
    .addBoard({ board: 3526, takeoffVoltage: 24.9, landingVoltage: 23.2 })
    .build();
}

function getView() {
  const user = userEvent.setup();
  render(<LogsView />);

  const getBoardFilterInput = () => screen.getByLabelText(/Фільтр за бортом/);
  const getTable = () => screen.findByRole("table");
  const getColumnsToggleButton = () => screen.getByRole("button", { name: "Показати/сховати фільтр стовпців таблиці" });
  const getColumnChip = (name: string | RegExp) => screen.getByRole("button", { name });
  const getColumnHeader = (name: string | RegExp) => screen.getByRole("columnheader", { name });

  const typeBoardFilter = (text: string) => user.type(getBoardFilterInput(), text);
  const openColumnsFilter = () => user.click(getColumnsToggleButton());
  const clickColumnChip = (name: string | RegExp) => user.click(getColumnChip(name));
  const clickReset = () => user.click(screen.getByRole("button", { name: "Скинути" }));

  return {
    user,
    getBoardFilterInput,
    getTable,
    getColumnsToggleButton,
    getColumnChip,
    getColumnHeader,
    typeBoardFilter,
    openColumnsFilter,
    clickColumnChip,
    clickReset,
  };
}

afterEach(() => {
  useFileStore.getState().clearFile();
  vi.mocked(getCoreWorker).mockRestore();
});

describe("LogsView", () => {
  it("renders the heading and description", () => {
    getView();
    expect(screen.getByRole("heading", { name: "Дані з логів" })).toBeInTheDocument();
  });

  it("shows a loading message while the shared file is being derived", async () => {
    let resolveParse!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveParse = resolve;
    });
    vi.mocked(getCoreWorker).mockReturnValueOnce({ parseFile: () => pending } as unknown as ReturnType<
      typeof getCoreWorker
    >);
    loadFile("sample-flight.bin", sampleBinBuf());

    getView();

    expect(await screen.findByText("Розбір файлу...")).toBeInTheDocument();
    resolveParse({ flights: [], boards: [], fmt: "bin" });
    await waitFor(() => expect(screen.queryByText("Розбір файлу...")).not.toBeInTheDocument());
  });

  it("parses a boardless .bin and shows '?' since a .bin has no board id of its own", async () => {
    loadFile("3570.bin", new FlightBinBuilder().build());
    getView();

    expect(await screen.findByText("?")).toBeInTheDocument();
  });

  it("loads a sample .bin and shows a results table", async () => {
    loadFile("sample-flight.bin", sampleBinBuf());
    const { getTable } = getView();

    expect(await getTable()).toBeInTheDocument();
    expect(screen.getByText("?")).toBeInTheDocument(); // .bin has no board id of its own
  });

  it("flags an anomaly for a flight with a real voltage sag, via a per-row findings badge", async () => {
    // The sample .bin's voltage curve (25.2V -> 22.4V under load) is an ~11% sag,
    // above the advisor's warning threshold - the row should get a findings badge.
    loadFile("sample-flight.bin", sampleBinBuf());
    const { getTable, user } = getView();
    await getTable();

    const badge = screen.getByRole("button", { name: "Знайдено зауважень: 1 - натисніть для деталей" });
    expect(badge).toHaveTextContent("1");

    await user.click(badge);
    expect(await screen.findByText(/Помітна просадка напруги під газом/)).toBeInTheDocument();
  });

  it("shows a quiet 'no issues' indicator for a clean flight", async () => {
    loadFile("clean.bin", new FlightBinBuilder().build()); // default voltages: no sag, no GPS teleports
    const { getTable } = getView();

    await getTable();
    expect(screen.getByText("Проблем не знайдено")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Знайдено зауважень/ })).not.toBeInTheDocument();
  });

  it("loads a sample .skylog and warns about multiple boards", async () => {
    loadFile("sample-log.skylog", sampleSkylogBuf());
    getView();

    expect(await screen.findByText(/У лозі кілька бортів/)).toBeInTheDocument();
    expect(screen.getByText("3570")).toBeInTheDocument();
    expect(screen.getByText("3526")).toBeInTheDocument();
  });

  it("live-filters the table by board as the filter input changes", async () => {
    loadFile("sample-log.skylog", sampleSkylogBuf());
    const { typeBoardFilter } = getView();
    await screen.findByText("3570");

    await typeBoardFilter("3526");

    expect(screen.queryByText("3570")).not.toBeInTheDocument();
    expect(screen.getByText("3526")).toBeInTheDocument();
  });

  it("shows a no-match warning when the filter matches no board", async () => {
    loadFile("sample-flight.bin", sampleBinBuf());
    const { getTable, typeBoardFilter } = getView();
    await getTable();

    await typeBoardFilter("9999");

    expect(await screen.findByText(/Вильотів за фільтром/)).toBeInTheDocument();
  });

  it("shows an info message when the board never got airborne", async () => {
    loadFile("ground.bin", new FlightBinBuilder().groundedOnly().build());
    getView();

    expect(await screen.findByText(/не піднявся в повітря/)).toBeInTheDocument();
  });

  it("shows an error message for a skylog missing -extended_log", async () => {
    loadFile("raw.skylog", new SkylogFileBuilder().addBoard({ board: 1001 }).withoutExtendedLog().build());
    getView();

    expect(await screen.findByText(/Скористайтесь \.bin/)).toBeInTheDocument();
  });

  describe("customizable columns", () => {
    it("shows every column by default, with no toggle for the board column", async () => {
      loadFile("sample-flight.bin", sampleBinBuf());
      const { getTable, getColumnHeader } = getView();
      await getTable();

      expect(getColumnHeader("Напруга при взльоті, В")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Серійний номер борта" })).not.toBeInTheDocument();
    });

    it("removes a column when its chip is clicked, and re-adds it at the end when clicked again", async () => {
      loadFile("sample-flight.bin", sampleBinBuf());
      const { getTable, openColumnsFilter, clickColumnChip } = getView();
      await getTable();
      await openColumnsFilter();

      await clickColumnChip("Напруга при взльоті, В");
      expect(screen.queryByRole("columnheader", { name: "Напруга при взльоті, В" })).not.toBeInTheDocument();

      await clickColumnChip("Напруга при взльоті, В");
      const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
      expect(headers.at(-2)).toBe("Напруга при взльоті, В"); // last real column; final header cell is the copy-button spacer
    });

    it("restores the default columns when Reset is clicked", async () => {
      loadFile("sample-flight.bin", sampleBinBuf());
      const { getTable, openColumnsFilter, clickColumnChip, clickReset, getColumnHeader } = getView();
      await getTable();
      await openColumnsFilter();

      await clickColumnChip("Напруга при взльоті, В");
      await clickReset();

      expect(getColumnHeader("Напруга при взльоті, В")).toBeInTheDocument();
    });

    it("shows the approximate-data note only while an approximate column is selected", async () => {
      loadFile("sample-flight.bin", sampleBinBuf());
      const { getTable, openColumnsFilter, clickColumnChip } = getView();
      await getTable();
      await openColumnsFilter();

      expect(screen.getByText(/приблизні або розрахункові значення/)).toBeInTheDocument();

      await clickColumnChip(/^Максимальна відстань від бази, м/);
      await clickColumnChip(/^Пройдений шлях, км/);

      expect(screen.queryByText(/приблизні або розрахункові значення/)).not.toBeInTheDocument();
    });

    it("offers the suggested metrics as chips but leaves them out of the table by default", async () => {
      loadFile("sample-flight.bin", sampleBinBuf());
      const { getTable, openColumnsFilter, getColumnChip, clickColumnChip } = getView();
      await getTable();
      await openColumnsFilter();

      const chip = getColumnChip("Просадка напруги, %");
      expect(chip).toBeInTheDocument();
      expect(screen.queryByRole("columnheader", { name: "Просадка напруги, %" })).not.toBeInTheDocument();

      await clickColumnChip("Просадка напруги, %");
      expect(screen.getByRole("columnheader", { name: "Просадка напруги, %" })).toBeInTheDocument();
    });
  });

  describe("translated metric headers", () => {
    afterEach(async () => {
      await i18n.changeLanguage("uk"); // reset for other tests
    });

    it("shows metric column headers in English when the language switches", async () => {
      loadFile("sample-flight.bin", sampleBinBuf());
      const { getTable, openColumnsFilter } = getView();
      await getTable();
      await openColumnsFilter();

      await i18n.changeLanguage("en");

      expect(await screen.findByRole("columnheader", { name: "Takeoff voltage, V" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Voltage sag, %" })).toBeInTheDocument();
    });
  });

  describe("copy to clipboard", () => {
    afterEach(() => {
      copyTextMock.mockClear();
    });

    it("copies every row (tab-separated, no header) and shows a confirmation", async () => {
      loadFile("sample-flight.bin", sampleBinBuf());
      const { getTable, user } = getView();
      await getTable();

      await user.click(screen.getByRole("button", { name: "Копіювати всі рядки" }));

      await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
      expect(copyTextMock.mock.calls[0]![0]).not.toMatch(/^Серійний номер борта/);
      expect(await screen.findByRole("button", { name: "Скопійовано" })).toBeInTheDocument();
    });

    it("copies a single row via its row button", async () => {
      loadFile("sample-log.skylog", sampleSkylogBuf());
      const { getTable, user } = getView();
      const table = await getTable();

      const row = within(table).getByText("3570").closest("tr")!;
      await user.click(within(row).getByRole("button", { name: "Копіювати" }));

      await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
      expect(copyTextMock.mock.calls[0]![0]).toMatch(/^3570\t/);
    });
  });
});
