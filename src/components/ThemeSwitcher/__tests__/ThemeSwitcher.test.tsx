import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useThemeStore } from "../../../stores/themeStore/themeStore";
import { ThemeSwitcher } from "../ThemeSwitcher";

afterEach(() => {
  useThemeStore.getState().setMode("system"); // reset for other tests
});

describe("ThemeSwitcher", () => {
  it("defaults to System and marks it pressed", () => {
    render(<ThemeSwitcher />);
    expect(screen.getByRole("radio", { name: "Системна" })).toHaveAttribute("data-state", "on");
  });

  it("switches to Dark when clicked and applies the dark class", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);

    await user.click(screen.getByRole("radio", { name: "Темна" }));

    expect(useThemeStore.getState().mode).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("radio", { name: "Темна" })).toHaveAttribute("data-state", "on");
  });

  it("persists the choice to localStorage", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);

    await user.click(screen.getByRole("radio", { name: "Темна" }));

    expect(localStorage.getItem("ardulens:theme")).toBe("dark");
  });

  it("compact mode opens a popover with the same options", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher compact />);

    await user.click(screen.getByRole("button", { name: "Тема" }));

    expect(await screen.findByRole("radio", { name: "Темна" })).toBeInTheDocument();
  });
});
