import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlightBinBuilder } from "../../../builders/FlightBinBuilder/FlightBinBuilder";
import { SkylogFileBuilder } from "../../../builders/SkylogFileBuilder/SkylogFileBuilder";
import i18n from "../../../i18n/i18n";
import { copyText } from "../../../services/clipboard/clipboard";
import { LogsView } from "../LogsView";

vi.mock("../../../services/clipboard/clipboard", () => ({ copyText: vi.fn().mockResolvedValue(undefined) }));
const copyTextMock = vi.mocked(copyText);

describe("LogsView", () => {
  it("renders the heading and description", () => {
    render(<LogsView />);
    expect(screen.getByRole("heading", { name: "Дані з логів" })).toBeInTheDocument();
  });

  it("parses a real .bin file dropped through the file input, using the typed board id", async () => {
    const user = userEvent.setup();
    render(<LogsView />);
    const buf = new FlightBinBuilder().build();
    const file = new File([buf], "3570.bin", { type: "application/octet-stream" });

    await user.type(screen.getByLabelText(/Фільтр за бортом/), "3570");
    const input = screen.getByTestId("log-file-input");
    await userEvent.upload(input, file);

    expect(await screen.findByText("3570")).toBeInTheDocument();
  });

  it("loads a sample .bin and shows a results table", async () => {
    const user = userEvent.setup();
    render(<LogsView />);

    await user.click(screen.getByRole("button", { name: "Приклад .bin" }));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByText("3570")).toBeInTheDocument();
  });

  it("loads a sample .skylog and warns about multiple boards", async () => {
    const user = userEvent.setup();
    render(<LogsView />);

    await user.click(screen.getByRole("button", { name: "Приклад .skylog" }));

    expect(await screen.findByText(/У лозі кілька бортів/)).toBeInTheDocument();
    expect(screen.getByText("3570")).toBeInTheDocument();
    expect(screen.getByText("3526")).toBeInTheDocument();
  });

  it("live-filters the table by board as the filter input changes", async () => {
    const user = userEvent.setup();
    render(<LogsView />);
    await user.click(screen.getByRole("button", { name: "Приклад .skylog" }));
    await screen.findByText("3570");

    await user.type(screen.getByLabelText(/Фільтр за бортом/), "3526");

    expect(screen.queryByText("3570")).not.toBeInTheDocument();
    expect(screen.getByText("3526")).toBeInTheDocument();
  });

  it("shows a no-match warning when the filter matches no board", async () => {
    const user = userEvent.setup();
    render(<LogsView />);
    await user.click(screen.getByRole("button", { name: "Приклад .bin" }));
    await screen.findByRole("table");

    await user.type(screen.getByLabelText(/Фільтр за бортом/), "9999");

    expect(await screen.findByText(/Вильотів за фільтром/)).toBeInTheDocument();
  });

  it("shows an info message when the board never got airborne", async () => {
    render(<LogsView />);
    const buf = new FlightBinBuilder().groundedOnly().build();
    const input = screen.getByTestId("log-file-input");
    await userEvent.upload(input, new File([buf], "ground.bin"));

    expect(await screen.findByText(/не піднявся в повітря/)).toBeInTheDocument();
  });

  it("shows an error message for a skylog missing -extended_log", async () => {
    render(<LogsView />);
    const buf = new SkylogFileBuilder().addBoard({ board: 1001 }).withoutExtendedLog().build();
    const input = screen.getByTestId("log-file-input");
    await userEvent.upload(input, new File([buf], "raw.skylog"));

    expect(await screen.findByText(/Скористайтесь \.bin/)).toBeInTheDocument();
  });

  it("parses a file dropped onto the drop zone", async () => {
    render(<LogsView />);
    const buf = new FlightBinBuilder().build();
    const file = new File([buf], "3570.bin", { type: "application/octet-stream" });
    const dropzone = screen.getByTestId("log-dropzone");

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(await screen.findByText("?")).toBeInTheDocument(); // no board filter typed -> falls back to "?"
  });

  describe("customizable columns", () => {
    it("shows every column by default, with no toggle for the board column", async () => {
      const user = userEvent.setup();
      render(<LogsView />);
      await user.click(screen.getByRole("button", { name: "Приклад .bin" }));
      await screen.findByRole("table");

      expect(screen.getByRole("columnheader", { name: "Напруга при взльоті, В" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Серійний номер борта" })).not.toBeInTheDocument();
    });

    it("removes a column when its chip is clicked, and re-adds it at the end when clicked again", async () => {
      const user = userEvent.setup();
      render(<LogsView />);
      await user.click(screen.getByRole("button", { name: "Приклад .bin" }));
      await screen.findByRole("table");

      await user.click(screen.getByRole("button", { name: "Напруга при взльоті, В" }));
      expect(screen.queryByRole("columnheader", { name: "Напруга при взльоті, В" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Напруга при взльоті, В" }));
      const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
      expect(headers.at(-2)).toBe("Напруга при взльоті, В"); // last real column; final header cell is the copy-button spacer
    });

    it("restores the default columns when Reset is clicked", async () => {
      const user = userEvent.setup();
      render(<LogsView />);
      await user.click(screen.getByRole("button", { name: "Приклад .bin" }));
      await screen.findByRole("table");

      await user.click(screen.getByRole("button", { name: "Напруга при взльоті, В" }));
      await user.click(screen.getByRole("button", { name: "Скинути" }));

      expect(screen.getByRole("columnheader", { name: "Напруга при взльоті, В" })).toBeInTheDocument();
    });

    it("shows the approximate-data note only while an approximate column is selected", async () => {
      const user = userEvent.setup();
      render(<LogsView />);
      await user.click(screen.getByRole("button", { name: "Приклад .bin" }));
      await screen.findByRole("table");

      expect(screen.getByText(/приблизні або розрахункові значення/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /^Максимальна відстань від бази, м/ }));
      await user.click(screen.getByRole("button", { name: /^Пройдений шлях, км/ }));

      expect(screen.queryByText(/приблизні або розрахункові значення/)).not.toBeInTheDocument();
    });

    it("offers the suggested metrics as chips but leaves them out of the table by default", async () => {
      const user = userEvent.setup();
      render(<LogsView />);
      await user.click(screen.getByRole("button", { name: "Приклад .bin" }));
      await screen.findByRole("table");

      const chip = screen.getByRole("button", { name: "Просадка напруги, %" });
      expect(chip).toBeInTheDocument();
      expect(screen.queryByRole("columnheader", { name: "Просадка напруги, %" })).not.toBeInTheDocument();

      await user.click(chip);
      expect(screen.getByRole("columnheader", { name: "Просадка напруги, %" })).toBeInTheDocument();
    });
  });

  describe("translated metric headers", () => {
    afterEach(async () => {
      await i18n.changeLanguage("uk"); // reset for other tests
    });

    it("shows metric column headers in English when the language switches", async () => {
      const user = userEvent.setup();
      render(<LogsView />);
      await user.click(screen.getByRole("button", { name: "Приклад .bin" }));
      await screen.findByRole("table");

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
      const user = userEvent.setup();
      render(<LogsView />);
      await user.click(screen.getByRole("button", { name: "Приклад .bin" }));
      await screen.findByRole("table");

      await user.click(screen.getByRole("button", { name: "Копіювати всі рядки" }));

      await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
      expect(copyTextMock.mock.calls[0]![0]).not.toMatch(/^Серійний номер борта/);
      expect(await screen.findByRole("button", { name: "Скопійовано" })).toBeInTheDocument();
    });

    it("copies a single row via its row button", async () => {
      const user = userEvent.setup();
      render(<LogsView />);
      await user.click(screen.getByRole("button", { name: "Приклад .bin" }));
      const table = await screen.findByRole("table");

      const row = within(table).getByText("3570").closest("tr")!;
      await user.click(within(row).getByRole("button", { name: "Копіювати" }));

      await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
      expect(copyTextMock.mock.calls[0]![0]).toMatch(/^3570\t/);
    });
  });
});
