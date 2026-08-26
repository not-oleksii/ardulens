import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../../../i18n/i18n";
import { useFileStore } from "../../../stores/fileStore/fileStore";
import { useUnsavedChangesStore } from "../../../stores/unsavedChangesStore/unsavedChangesStore";
import { useUiStore } from "../../../stores/uiStore/uiStore";
import { Sidebar } from "../Sidebar";

function getView() {
  const user = userEvent.setup();
  render(<Sidebar />);

  const getCollapseButton = () => screen.getByRole("button", { name: "Згорнути бічну панель" });
  const getExpandButton = () => screen.getByRole("button", { name: "Розгорнути бічну панель" });
  const getChangeFileButton = () => screen.getByRole("button", { name: "Змінити файл" });
  const clickCollapse = () => user.click(getCollapseButton());
  const clickExpand = () => user.click(getExpandButton());
  const clickChangeFile = () => user.click(getChangeFileButton());
  const clickTab = (name: string) => user.click(screen.getByRole("tab", { name }));

  return {
    user,
    getCollapseButton,
    getExpandButton,
    getChangeFileButton,
    clickCollapse,
    clickExpand,
    clickChangeFile,
    clickTab,
  };
}

describe("Sidebar", () => {
  afterEach(async () => {
    useFileStore.getState().clearFile();
    useUnsavedChangesStore.getState().setUnsaved(false);
    useUiStore.getState().setActiveTab("logs");
    await i18n.changeLanguage("uk");
  });

  it("shows the app title and tab labels by default", () => {
    getView();
    expect(screen.getByRole("heading", { name: "ArduLens", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Логи" })).toBeInTheDocument();
  });

  it("hides the title and tab labels once collapsed, keeping tabs reachable by accessible name", async () => {
    const { clickCollapse } = getView();

    await clickCollapse();

    expect(screen.queryByRole("heading", { name: "ArduLens", level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Мова інтерфейсу" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Логи" })).toBeInTheDocument();
  });

  it("offers language and theme switching via the Settings dialog, reachable by accessible name even when collapsed", async () => {
    const { user, clickCollapse } = getView();

    await clickCollapse();
    await user.click(screen.getByRole("button", { name: "Мова та тема" }));

    expect(screen.getByRole("radiogroup", { name: "Мова інтерфейсу" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Тема" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "EN" }));

    expect(i18n.language).toBe("en");
  });

  it("expands again when the toggle is clicked a second time", async () => {
    const { clickCollapse, clickExpand } = getView();

    await clickCollapse();
    await clickExpand();

    expect(screen.getByRole("heading", { name: "ArduLens", level: 1 })).toBeInTheDocument();
  });

  it("clears the shared file store when 'Change file' is clicked, returning to the home screen", async () => {
    useFileStore.getState().setFile({ name: "flight.bin", buf: new ArrayBuffer(0) });
    const { clickChangeFile } = getView();

    await clickChangeFile();

    expect(useFileStore.getState().file).toBeNull();
  });

  it("keeps the 'Change file' action reachable by accessible name once collapsed", async () => {
    const { clickCollapse, getChangeFileButton } = getView();

    await clickCollapse();

    expect(getChangeFileButton()).toBeInTheDocument();
  });

  it("shows the current file's name, and nothing when no file is loaded", async () => {
    getView();
    expect(screen.queryByText(/Файл:/)).not.toBeInTheDocument();

    useFileStore.getState().setFile({ name: "flight.bin", buf: new ArrayBuffer(0) });
    expect(await screen.findByText("Файл: flight.bin")).toBeInTheDocument();
  });

  it("hides the filename once collapsed (same as the other labels)", async () => {
    useFileStore.getState().setFile({ name: "flight.bin", buf: new ArrayBuffer(0) });
    const { clickCollapse } = getView();

    await clickCollapse();

    expect(screen.queryByText("Файл: flight.bin")).not.toBeInTheDocument();
  });

  it("confirms before discarding unsaved GeoTag progress when 'Change file' is clicked", async () => {
    useFileStore.getState().setFile({ name: "flight.bin", buf: new ArrayBuffer(0) });
    useUnsavedChangesStore.getState().setUnsaved(true);
    const { clickChangeFile } = getView();

    await clickChangeFile();

    expect(useFileStore.getState().file).not.toBeNull(); // not cleared yet
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cancelling the confirmation keeps the file loaded", async () => {
    useFileStore.getState().setFile({ name: "flight.bin", buf: new ArrayBuffer(0) });
    useUnsavedChangesStore.getState().setUnsaved(true);
    const { user, clickChangeFile } = getView();

    await clickChangeFile();
    await user.click(screen.getByRole("button", { name: "Залишитися" }));

    expect(useFileStore.getState().file).not.toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirming the discard actually clears the file", async () => {
    useFileStore.getState().setFile({ name: "flight.bin", buf: new ArrayBuffer(0) });
    useUnsavedChangesStore.getState().setUnsaved(true);
    const { user, clickChangeFile } = getView();

    await clickChangeFile();
    await user.click(screen.getByRole("button", { name: "Продовжити і скасувати прогрес" }));

    expect(useFileStore.getState().file).toBeNull();
  });

  it("switches tabs normally when there's no unsaved GeoTag progress", async () => {
    const { clickTab } = getView();

    await clickTab("Графіки");

    expect(useUiStore.getState().activeTab).toBe("graphs");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirms before switching tabs when there's unsaved GeoTag progress - App.tsx mounts only one tab at a time, so switching away from GeoTag would silently drop it same as 'Change file' would", async () => {
    useUnsavedChangesStore.getState().setUnsaved(true);
    const { clickTab } = getView();

    await clickTab("Графіки");

    expect(useUiStore.getState().activeTab).toBe("logs"); // unchanged until confirmed
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cancelling a tab-switch confirmation keeps the original tab active", async () => {
    useUnsavedChangesStore.getState().setUnsaved(true);
    const { user, clickTab } = getView();

    await clickTab("Графіки");
    await user.click(screen.getByRole("button", { name: "Залишитися" }));

    expect(useUiStore.getState().activeTab).toBe("logs");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirming a tab-switch actually switches tabs", async () => {
    useUnsavedChangesStore.getState().setUnsaved(true);
    const { user, clickTab } = getView();

    await clickTab("Графіки");
    await user.click(screen.getByRole("button", { name: "Продовжити і скасувати прогрес" }));

    expect(useUiStore.getState().activeTab).toBe("graphs");
  });
});
