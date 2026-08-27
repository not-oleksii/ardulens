import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { FlightBinBuilder } from "../../../builders/FlightBinBuilder/FlightBinBuilder";
import { SkylogFileBuilder } from "../../../builders/SkylogFileBuilder/SkylogFileBuilder";
import { getCoreWorker } from "../../../services/coreWorkerClient/coreWorkerClient";
import { useFileStore } from "../../../stores/fileStore/fileStore";
import { dropFile } from "../../../test/dropFile";
import { HOME_DROPZONE_TEST_ID, HomeView } from "../HomeView";

vi.mock("../../../services/coreWorkerClient/coreWorkerClient", async () => {
  const actual = await vi.importActual<typeof import("../../../services/coreWorkerClient/coreWorkerClient")>(
    "../../../services/coreWorkerClient/coreWorkerClient",
  );
  return { getCoreWorker: vi.fn(actual.getCoreWorker) };
});

function getView() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <HomeView />
    </MemoryRouter>,
  );

  const getLogsCard = () => screen.getByTestId(`${HOME_DROPZONE_TEST_ID}-card`);
  const getVehicleSetupLink = () => screen.getByRole("link", { name: /Налаштування апарата/ });
  const getGroundStationLink = () => screen.getByRole("link", { name: /Наземна станція/ });
  const getBackButton = () => screen.getByRole("button", { name: "Назад" });
  const getFileInput = () => screen.getByTestId(`${HOME_DROPZONE_TEST_ID}-file-input`);
  const getSampleBinButton = () => screen.getByRole("button", { name: "Приклад .bin" });
  const getSampleSkylogButton = () => screen.getByRole("button", { name: "Приклад .skylog" });

  const enterLogs = () => user.click(getLogsCard());
  const clickBack = () => user.click(getBackButton());
  const uploadFile = (file: File) => user.upload(getFileInput(), file);
  const dropFileOnZone = (file: File) => dropFile(`${HOME_DROPZONE_TEST_ID}-dropzone`, file);
  const clickSampleBin = () => user.click(getSampleBinButton());
  const clickSampleSkylog = () => user.click(getSampleSkylogButton());

  return {
    user,
    getLogsCard,
    getVehicleSetupLink,
    getGroundStationLink,
    getBackButton,
    getFileInput,
    getSampleBinButton,
    getSampleSkylogButton,
    enterLogs,
    clickBack,
    uploadFile,
    dropFileOnZone,
    clickSampleBin,
    clickSampleSkylog,
  };
}

afterEach(() => {
  useFileStore.getState().clearFile();
  vi.mocked(getCoreWorker).mockRestore();
});

describe("HomeView", () => {
  it("shows the 3-way chooser (Logs/Vehicle Setup/Ground Station) with no dropzone yet", () => {
    getView();
    expect(screen.getByRole("heading", { name: "ArduLens" })).toBeInTheDocument();
    expect(screen.getByText("Аналіз логів")).toBeInTheDocument();
    expect(screen.getByText("Налаштування апарата")).toBeInTheDocument();
    expect(screen.getByText("Наземна станція")).toBeInTheDocument();
    expect(screen.queryByTestId(`${HOME_DROPZONE_TEST_ID}-dropzone`)).not.toBeInTheDocument();
  });

  it("links Vehicle Setup to /ardupilot-setup and Ground Station to /ground-station", () => {
    const { getVehicleSetupLink, getGroundStationLink } = getView();
    expect(getVehicleSetupLink()).toHaveAttribute("href", "/ardupilot-setup");
    expect(getGroundStationLink()).toHaveAttribute("href", "/ground-station");
  });

  it("clicking Analyze Logs reveals the dropzone, and Back returns to the chooser", async () => {
    const { enterLogs, clickBack } = getView();

    await enterLogs();
    expect(screen.getByTestId(`${HOME_DROPZONE_TEST_ID}-dropzone`)).toBeInTheDocument();
    expect(screen.queryByText("Наземна станція")).not.toBeInTheDocument();

    await clickBack();
    expect(screen.queryByTestId(`${HOME_DROPZONE_TEST_ID}-dropzone`)).not.toBeInTheDocument();
    expect(screen.getByText("Наземна станція")).toBeInTheDocument();
  });

  it("uploading a valid file sets the shared file store", async () => {
    const { enterLogs, uploadFile } = getView();
    await enterLogs();
    const buf = new FlightBinBuilder().build();
    const file = new File([buf], "flight.bin", { type: "application/octet-stream" });

    await uploadFile(file);

    expect(await vi.waitFor(() => useFileStore.getState().file)).toEqual({ name: "flight.bin", buf });
  });

  it("dropping a valid file onto the drop zone sets the shared file store", async () => {
    const { enterLogs, dropFileOnZone } = getView();
    await enterLogs();
    const buf = new FlightBinBuilder().build();
    const file = new File([buf], "flight.bin", { type: "application/octet-stream" });

    dropFileOnZone(file);

    await vi.waitFor(() => expect(useFileStore.getState().file).not.toBeNull());
    expect(useFileStore.getState().file?.name).toBe("flight.bin");
  });

  it("clicking the sample .bin button loads a sample flight into the shared file store", async () => {
    const { enterLogs, clickSampleBin } = getView();
    await enterLogs();

    await clickSampleBin();

    await vi.waitFor(() => expect(useFileStore.getState().file).not.toBeNull());
    expect(useFileStore.getState().file?.name).toBe("sample-flight.bin");
  });

  it("clicking the sample .skylog button loads a sample multi-board skylog into the shared file store", async () => {
    const { enterLogs, clickSampleSkylog } = getView();
    await enterLogs();

    await clickSampleSkylog();

    await vi.waitFor(() => expect(useFileStore.getState().file).not.toBeNull());
    expect(useFileStore.getState().file?.name).toBe("sample-log.skylog");
  });

  it("shows an error and does NOT enter the app for an invalid file", async () => {
    const { enterLogs, uploadFile } = getView();
    await enterLogs();
    const buf = new SkylogFileBuilder().addBoard({ board: 1001 }).withoutExtendedLog().build();

    await uploadFile(new File([buf], "raw.skylog"));

    expect(await screen.findByText(/Скористайтесь \.bin/)).toBeInTheDocument();
    expect(useFileStore.getState().file).toBeNull();
  });

  it("shows a loading spinner while parsing", async () => {
    let resolveParse!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveParse = resolve;
    });
    vi.mocked(getCoreWorker).mockReturnValueOnce({
      parseFile: () => pending,
    } as unknown as ReturnType<typeof getCoreWorker>);

    const { enterLogs, clickSampleBin, getSampleBinButton } = getView();
    await enterLogs();
    const clickPromise = clickSampleBin();

    expect(await screen.findByText("Розбір файлу...")).toBeInTheDocument();
    expect(getSampleBinButton()).toBeDisabled();

    resolveParse({ flights: [], boards: [], fmt: "bin" });
    await clickPromise;

    expect(screen.queryByText("Розбір файлу...")).not.toBeInTheDocument();
  });
});
