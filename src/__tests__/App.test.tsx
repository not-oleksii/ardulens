import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import App from "../App";
import i18n from "../i18n/i18n";
import { useUiStore } from "../stores/uiStore/uiStore";

afterEach(async () => {
  useUiStore.getState().setActiveTab("dashboard");
  await i18n.changeLanguage("uk");
});

describe("App", () => {
  it("renders the app title and the dashboard tab by default", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "ArduLens", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Огляд" })).toBeInTheDocument();
  });

  it("switches views when a different tab is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Графіки" }));
    expect(screen.getByRole("heading", { name: "Графіки" })).toBeInTheDocument();
  });

  it("switches every visible label to English when the EN language button is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("radio", { name: "EN" }));

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Graphs" })).toBeInTheDocument();
  });
});
