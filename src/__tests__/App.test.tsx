import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import App from "../App";
import i18n from "../i18n/i18n";
import { HOME_DROPZONE_TEST_ID } from "../pages/HomeView/HomeView";
import { useFileStore } from "../stores/fileStore/fileStore";
import { useMavlinkConnectionStore } from "../stores/mavlinkConnectionStore/mavlinkConnectionStore";
import { useUiStore } from "../stores/uiStore/uiStore";

function getView(initialPath = "/") {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );

  const getLogsCard = () => screen.getByTestId(`${HOME_DROPZONE_TEST_ID}-card`);
  const enterLogs = () => user.click(getLogsCard());
  const getSampleBinButton = () => screen.getByRole("button", { name: /Приклад \.bin|Sample \.bin/ });
  const clickSampleBin = () => user.click(getSampleBinButton());
  const getArduPilotSetupLink = () => screen.getByRole("link", { name: /Налаштування апарата|Vehicle Setup/ });
  const clickArduPilotSetupLink = () => user.click(getArduPilotSetupLink());

  return { user, getLogsCard, enterLogs, getSampleBinButton, clickSampleBin, getArduPilotSetupLink, clickArduPilotSetupLink };
}

beforeEach(() => {
  mockWindows("main");
  mockIPC((cmd) => (cmd === "list_serial_ports" ? [] : undefined), { shouldMockEvents: true });
});

afterEach(async () => {
  // See ArduPilotSetupView.test.tsx for why cleanup() + a macrotask flush must happen
  // before clearMocks() - the ArduPilot Setup route mounted here uses the same
  // subscribe-in-effect pattern.
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  clearMocks();
  useFileStore.getState().clearFile();
  useMavlinkConnectionStore.getState().reset();
  useUiStore.getState().setActiveTab("logs");
  await i18n.changeLanguage("uk");
});

describe("App", () => {
  it("shows the 3-way chooser (no sidebar/tabs) when no file is loaded yet", () => {
    getView();
    expect(screen.getByRole("heading", { name: "ArduLens", level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId(`${HOME_DROPZONE_TEST_ID}-card`)).toBeInTheDocument();
    expect(screen.queryByTestId(`${HOME_DROPZONE_TEST_ID}-dropzone`)).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("enters the app (sidebar + Logs tab) once a file is loaded via the home screen", async () => {
    const { enterLogs, clickSampleBin } = getView();
    await enterLogs();

    await clickSampleBin();

    expect(await screen.findByRole("heading", { name: "Дані з логів" })).toBeInTheDocument();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("only shows tabs with real functionality, hiding work-in-progress pages", async () => {
    const { enterLogs, clickSampleBin } = getView();
    await enterLogs();
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
    const { user, enterLogs, clickSampleBin } = getView();
    await user.click(screen.getByRole("radio", { name: "EN" }));
    await enterLogs();

    await clickSampleBin();

    expect(await screen.findByRole("heading", { name: "Log Data" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Logs" })).toBeInTheDocument();
  });

  // Both of these give the test itself (not just findByRole's own internal wait) a longer
  // timeout than Vitest's 5000ms default - ArduPilotSetupView is lazy-loaded (see App.tsx) and
  // pulls in a lot (~25 section components, the full mavlink registry), so its dynamic import
  // alone can take longer than that under full-suite load on this machine, well before React
  // even starts rendering the real heading.
  it(
    "navigates to the ArduPilot Setup page from the Home CTA",
    async () => {
      const { clickArduPilotSetupLink } = getView();

      await clickArduPilotSetupLink();

      expect(await screen.findByRole("heading", { name: "Налаштування ArduPilot" }, { timeout: 9000 })).toBeInTheDocument();
    },
    10000,
  );

  it(
    "renders the ArduPilot Setup page directly at /ardupilot-setup, independent of the file store",
    async () => {
      getView("/ardupilot-setup");

      expect(await screen.findByRole("heading", { name: "Налаштування ArduPilot" }, { timeout: 9000 })).toBeInTheDocument();
      expect(screen.queryByTestId(`${HOME_DROPZONE_TEST_ID}-dropzone`)).not.toBeInTheDocument();
    },
    10000,
  );

  it(
    "navigates to the Ground Station page from the home screen",
    async () => {
      const { user } = getView();

      await user.click(screen.getByRole("link", { name: /Наземна станція/ }));

      expect(await screen.findByRole("heading", { name: "Наземна станція" }, { timeout: 9000 })).toBeInTheDocument();
    },
    10000,
  );

  it(
    "renders the Ground Station page directly at /ground-station, independent of the file store",
    async () => {
      getView("/ground-station");

      expect(await screen.findByRole("heading", { name: "Наземна станція" }, { timeout: 9000 })).toBeInTheDocument();
      expect(screen.queryByTestId(`${HOME_DROPZONE_TEST_ID}-dropzone`)).not.toBeInTheDocument();
    },
    10000,
  );
});
