import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlightBinBuilder } from "../../../builders/FlightBinBuilder/FlightBinBuilder";
import { SkylogFileBuilder } from "../../../builders/SkylogFileBuilder/SkylogFileBuilder";
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
