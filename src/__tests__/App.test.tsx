import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import App from "../App";
import i18n from "../i18n/i18n";
import { useUiStore } from "../stores/uiStore/uiStore";

afterEach(async () => {
  useUiStore.getState().setActiveTab("logs");
  await i18n.changeLanguage("uk");
});

describe("App", () => {
  it("renders the app title and the logs tab by default", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "ArduLens", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Дані з логів" })).toBeInTheDocument();
  });

  it("only shows tabs with real functionality, hiding work-in-progress pages", () => {
    render(<App />);
    expect(screen.getByRole("tab", { name: "Логи" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Графіки" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Параметри" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Аналіз" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Порівняння" })).not.toBeInTheDocument();
  });

  it("switches every visible label to English when the EN language button is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("radio", { name: "EN" }));

    expect(screen.getByRole("heading", { name: "Log Data" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Logs" })).toBeInTheDocument();
  });
});
