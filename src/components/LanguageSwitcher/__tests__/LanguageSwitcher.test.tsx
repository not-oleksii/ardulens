import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../../../i18n/i18n";
import { LanguageSwitcher } from "../LanguageSwitcher";

afterEach(async () => {
  await i18n.changeLanguage("uk"); // reset for other tests
});

describe("LanguageSwitcher", () => {
  it("defaults to Ukrainian and marks it active", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole("button", { name: "UA" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "EN" })).not.toHaveClass("active");
  });

  it("switches the active i18next language when EN is clicked", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole("button", { name: "EN" }));

    expect(i18n.language).toBe("en");
    expect(screen.getByRole("button", { name: "EN" })).toHaveClass("active");
  });

  it("persists the choice to localStorage", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole("button", { name: "EN" }));

    expect(localStorage.getItem("ardulens:lang")).toBe("en");
  });
});
