import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n/i18n";
import { VERIFIED_FRAME_PRESETS } from "../../../mavlink/frameDiagrams/frameDiagrams";
import { ArduPilotSetupSidebar } from "../ArduPilotSetupSidebar";

function getView(overrides: { isConnected?: boolean } = {}) {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const setDevFramePresetKey = vi.fn();
  const onDevMode = vi.fn();
  const onDevModeCopter = vi.fn();
  render(
    <ArduPilotSetupSidebar
      activeSection="telemetry"
      onSelect={onSelect}
      isConnected={overrides.isConnected ?? false}
      isBusy={false}
      devFramePresetKey={VERIFIED_FRAME_PRESETS[1]!.key}
      setDevFramePresetKey={setDevFramePresetKey}
      onDevMode={onDevMode}
      onDevModeCopter={onDevModeCopter}
    />,
  );

  return { user, onSelect, setDevFramePresetKey, onDevMode, onDevModeCopter };
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

  it("offers Dev Mode connect controls inside Settings when not connected, and closes the dialog once one is used", async () => {
    const { user, onDevModeCopter } = getView({ isConnected: false });

    await user.click(screen.getByRole("button", { name: "Налаштування застосунку" }));
    expect(screen.getByLabelText("Тип рами для тестового мультикоптера")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Режим розробника (мультикоптер)" }));

    expect(onDevModeCopter).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hides the Dev Mode section once connected - it's no longer a relevant action", async () => {
    const { user } = getView({ isConnected: true });

    await user.click(screen.getByRole("button", { name: "Налаштування застосунку" }));

    expect(screen.queryByLabelText("Тип рами для тестового мультикоптера")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Режим розробника" })).not.toBeInTheDocument();
  });
});
