import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { FlightBinBuilder } from "../../../builders/FlightBinBuilder/FlightBinBuilder";
import { SkylogFileBuilder } from "../../../builders/SkylogFileBuilder/SkylogFileBuilder";
import { getCoreWorker } from "../../../services/coreWorkerClient/coreWorkerClient";
import { useFileStore } from "../../../stores/fileStore/fileStore";
import { dropFile } from "../../../test/dropFile";
import { HomeView } from "../HomeView";

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

  const getFileInput = () => screen.getByTestId("home-file-input");
  const getSampleBinButton = () => screen.getByRole("button", { name: "Приклад .bin" });
  const getSampleSkylogButton = () => screen.getByRole("button", { name: "Приклад .skylog" });
  const getArduPilotSetupLink = () => screen.getByRole("link", { name: "Налаштувати підключений апарат" });

  const uploadFile = (file: File) => user.upload(getFileInput(), file);
  const dropFileOnZone = (file: File) => dropFile("home-dropzone", file);
  const clickSampleBin = () => user.click(getSampleBinButton());
  const clickSampleSkylog = () => user.click(getSampleSkylogButton());

  return {
    user,
    getFileInput,
    getSampleBinButton,
    getSampleSkylogButton,
    getArduPilotSetupLink,
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
  it("renders the title, description, and dropzone", () => {
    getView();
    expect(screen.getByRole("heading", { name: "ArduLens" })).toBeInTheDocument();
    expect(screen.getByTestId("home-dropzone")).toBeInTheDocument();
  });

  it("links to the ArduPilot Setup page", () => {
    const { getArduPilotSetupLink } = getView();
    expect(getArduPilotSetupLink()).toHaveAttribute("href", "/ardupilot-setup");
  });

  it("uploading a valid file sets the shared file store", async () => {
    const { uploadFile } = getView();
    const buf = new FlightBinBuilder().build();
    const file = new File([buf], "flight.bin", { type: "application/octet-stream" });

    await uploadFile(file);

    expect(await vi.waitFor(() => useFileStore.getState().file)).toEqual({ name: "flight.bin", buf });
  });

  it("dropping a valid file onto the drop zone sets the shared file store", async () => {
    const { dropFileOnZone } = getView();
    const buf = new FlightBinBuilder().build();
    const file = new File([buf], "flight.bin", { type: "application/octet-stream" });

    dropFileOnZone(file);

    await vi.waitFor(() => expect(useFileStore.getState().file).not.toBeNull());
    expect(useFileStore.getState().file?.name).toBe("flight.bin");
  });

  it("clicking the sample .bin button loads a sample flight into the shared file store", async () => {
    const { clickSampleBin } = getView();

    await clickSampleBin();

    await vi.waitFor(() => expect(useFileStore.getState().file).not.toBeNull());
    expect(useFileStore.getState().file?.name).toBe("sample-flight.bin");
  });

  it("clicking the sample .skylog button loads a sample multi-board skylog into the shared file store", async () => {
    const { clickSampleSkylog } = getView();

    await clickSampleSkylog();

    await vi.waitFor(() => expect(useFileStore.getState().file).not.toBeNull());
    expect(useFileStore.getState().file?.name).toBe("sample-log.skylog");
  });

  it("shows an error and does NOT enter the app for an invalid file", async () => {
    const { uploadFile } = getView();
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

    const { clickSampleBin, getSampleBinButton } = getView();
    const clickPromise = clickSampleBin();

    expect(await screen.findByText("Розбір файлу...")).toBeInTheDocument();
    expect(getSampleBinButton()).toBeDisabled();

    resolveParse({ flights: [], boards: [], fmt: "bin" });
    await clickPromise;

    expect(screen.queryByText("Розбір файлу...")).not.toBeInTheDocument();
  });
});
