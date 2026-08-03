import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import App from "../App";
import i18n from "../i18n/i18n";
import { useFileStore } from "../stores/fileStore/fileStore";
import { useUiStore } from "../stores/uiStore/uiStore";

function getView() {
  const user = userEvent.setup();
  render(<App />);

  const getSampleBinButton = () => screen.getByRole("button", { name: /Приклад \.bin|Sample \.bin/ });
  const clickSampleBin = () => user.click(getSampleBinButton());

  return { user, getSampleBinButton, clickSampleBin };
}

afterEach(async () => {
  useFileStore.getState().clearFile();
  useUiStore.getState().setActiveTab("logs");
  await i18n.changeLanguage("uk");
});

describe("App", () => {
  it("shows the home screen (no sidebar/tabs) when no file is loaded yet", () => {
    getView();
    expect(screen.getByRole("heading", { name: "ArduLens", level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("home-dropzone")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("enters the app (sidebar + Logs tab) once a file is loaded via the home screen", async () => {
    const { clickSampleBin } = getView();

    await clickSampleBin();

    expect(await screen.findByRole("heading", { name: "Дані з логів" })).toBeInTheDocument();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("only shows tabs with real functionality, hiding work-in-progress pages", async () => {
    const { clickSampleBin } = getView();
    await clickSampleBin();
    await screen.findByRole("heading", { name: "Дані з логів" });

    expect(screen.getByRole("tab", { name: "Логи" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Графіки" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Параметри" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Аналіз" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Порівняння" })).not.toBeInTheDocument();
  });

  it("switches every visible label to English when the EN language button is clicked, from the home screen", async () => {
    const { user } = getView();

    await user.click(screen.getByRole("radio", { name: "EN" }));

    expect(screen.getByRole("heading", { name: "ArduLens", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Drop a \.skylog or \.bin file/)).toBeInTheDocument();
  });

  it("keeps the switched language once inside the app", async () => {
    const { user, clickSampleBin } = getView();
    await user.click(screen.getByRole("radio", { name: "EN" }));

    await clickSampleBin();

    expect(await screen.findByRole("heading", { name: "Log Data" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Logs" })).toBeInTheDocument();
  });
});
