import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../../../i18n/i18n";
import { LanguageSwitcher } from "../LanguageSwitcher";

afterEach(async () => {
  await i18n.changeLanguage("uk"); // reset for other tests
});

describe("LanguageSwitcher", () => {
  it("defaults to Ukrainian and marks it pressed", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole("radio", { name: "UA" })).toHaveAttribute("data-state", "on");
    expect(screen.getByRole("radio", { name: "EN" })).toHaveAttribute("data-state", "off");
  });

  it("switches the active i18next language when EN is clicked", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole("radio", { name: "EN" }));

    expect(i18n.language).toBe("en");
    expect(screen.getByRole("radio", { name: "EN" })).toHaveAttribute("data-state", "on");
  });

  it("persists the choice to localStorage", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole("radio", { name: "EN" }));

    expect(localStorage.getItem("ardulens:lang")).toBe("en");
  });
});
