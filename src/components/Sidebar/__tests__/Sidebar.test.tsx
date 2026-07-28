import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../../../i18n/i18n";
import { Sidebar } from "../Sidebar";

describe("Sidebar", () => {
  afterEach(async () => {
    await i18n.changeLanguage("uk");
  });

  it("shows the app title and tab labels by default", () => {
    render(<Sidebar />);
    expect(screen.getByRole("heading", { name: "ArduLens", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Логи" })).toBeInTheDocument();
  });

  it("hides the title and tab labels once collapsed, keeping tabs reachable by accessible name", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(screen.getByRole("button", { name: "Згорнути бічну панель" }));

    expect(screen.queryByRole("heading", { name: "ArduLens", level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Мова інтерфейсу" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Логи" })).toBeInTheDocument();
  });

  it("still offers language switching once collapsed, via a compact popup showing the active language", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(screen.getByRole("button", { name: "Згорнути бічну панель" }));
    await user.click(screen.getByRole("button", { name: "Мова інтерфейсу" }));

    expect(screen.getByRole("radio", { name: "EN" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "EN" }));

    expect(await screen.findByRole("button", { name: "Interface language" })).toHaveTextContent("EN");
  });

  it("expands again when the toggle is clicked a second time", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(screen.getByRole("button", { name: "Згорнути бічну панель" }));
    await user.click(screen.getByRole("button", { name: "Розгорнути бічну панель" }));

    expect(screen.getByRole("heading", { name: "ArduLens", level: 1 })).toBeInTheDocument();
  });
});
