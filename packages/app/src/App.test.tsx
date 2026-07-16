import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";
import { useUiStore } from "./stores/uiStore";

describe("App", () => {
  it("renders the app title and the dashboard tab by default", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "ArduLens", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Огляд" })).toBeInTheDocument();
  });

  it("switches views when a different tab is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Графіки" }));
    expect(screen.getByRole("heading", { name: "Графіки" })).toBeInTheDocument();

    useUiStore.getState().setActiveTab("dashboard"); // reset for other tests
  });
});
