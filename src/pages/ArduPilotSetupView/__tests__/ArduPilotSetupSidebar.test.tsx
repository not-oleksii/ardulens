import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n/i18n";
import { ArduPilotSetupSidebar } from "../ArduPilotSetupSidebar";

function getView() {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<ArduPilotSetupSidebar activeSection="telemetry" onSelect={onSelect} />);

  return { user, onSelect };
}

describe("ArduPilotSetupSidebar", () => {
  afterEach(async () => {
    await i18n.changeLanguage("uk");
  });

  it("offers language and theme switching via the Settings dialog", async () => {
    const { user } = getView();

    await user.click(screen.getByRole("button", { name: "Налаштування застосунку" }));

    expect(screen.getByRole("radiogroup", { name: "Мова інтерфейсу" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Тема" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "EN" }));

    expect(i18n.language).toBe("en");
  });
});
