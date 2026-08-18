import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlightBinBuilder } from "../../../builders/FlightBinBuilder/FlightBinBuilder";
import { SkylogFileBuilder } from "../../../builders/SkylogFileBuilder/SkylogFileBuilder";
import { getCoreWorker } from "../../../services/coreWorkerClient/coreWorkerClient";
import { useFileStore } from "../../../stores/fileStore/fileStore";
import { dropFile } from "../../../test/dropFile";
import { GlobalDropOverlay } from "../GlobalDropOverlay";

vi.mock("../../../services/coreWorkerClient/coreWorkerClient", async () => {
  const actual = await vi.importActual<typeof import("../../../services/coreWorkerClient/coreWorkerClient")>(
    "../../../services/coreWorkerClient/coreWorkerClient",
  );
  return { getCoreWorker: vi.fn(actual.getCoreWorker) };
});

function getView() {
  render(
    <GlobalDropOverlay>
      <div data-testid="child-content">child</div>
    </GlobalDropOverlay>,
  );

  const getZone = () => screen.getByTestId("global-drop-zone");
  const getChild = () => screen.getByTestId("child-content");
  const queryOverlay = () => screen.queryByTestId("global-drop-overlay");
  const dropOnZone = (file: File) => dropFile("global-drop-zone", file);

  return { getZone, getChild, queryOverlay, dropOnZone };
}

afterEach(() => {
  useFileStore.getState().clearFile();
  vi.mocked(getCoreWorker).mockRestore();
});

describe("GlobalDropOverlay", () => {
  it("renders children", () => {
    getView();
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("dropping a valid file replaces the already-loaded file in the shared store", async () => {
    useFileStore.getState().setFile({ name: "old.bin", buf: new ArrayBuffer(0) });
    const { dropOnZone } = getView();
    const buf = new FlightBinBuilder().build();
    const file = new File([buf], "new.bin", { type: "application/octet-stream" });

    dropOnZone(file);

    await vi.waitFor(() => expect(useFileStore.getState().file?.name).toBe("new.bin"));
  });

  it("shows the overlay while dragging and hides it once the drag leaves the outer zone", () => {
    const { getZone, getChild, queryOverlay } = getView();

    fireEvent.dragEnter(getZone());
    expect(queryOverlay()).toBeInTheDocument();

    fireEvent.dragEnter(getChild());
    fireEvent.dragLeave(getChild());
    expect(queryOverlay()).toBeInTheDocument();

    fireEvent.dragLeave(getZone());
    expect(queryOverlay()).not.toBeInTheDocument();
  });

  it("shows an error and does NOT replace the loaded file for an invalid file", async () => {
    useFileStore.getState().setFile({ name: "old.bin", buf: new ArrayBuffer(0) });
    const { dropOnZone } = getView();
    const buf = new SkylogFileBuilder().addBoard({ board: 1001 }).withoutExtendedLog().build();

    dropOnZone(new File([buf], "raw.skylog"));

    expect(await screen.findByText(/Скористайтесь \.bin/)).toBeInTheDocument();
    expect(useFileStore.getState().file?.name).toBe("old.bin");
  });

  it("shows the parsing stage text while a dropped file is being parsed", async () => {
    let resolveParse!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveParse = resolve;
    });
    vi.mocked(getCoreWorker).mockReturnValueOnce({
      parseFile: () => pending,
    } as unknown as ReturnType<typeof getCoreWorker>);

    const { dropOnZone } = getView();
    const buf = new FlightBinBuilder().build();
    dropOnZone(new File([buf], "new.bin", { type: "application/octet-stream" }));

    expect(await screen.findByText("Розбір файлу...")).toBeInTheDocument();

    resolveParse({ flights: [], boards: [], fmt: "bin" });
    await vi.waitFor(() => expect(screen.queryByText("Розбір файлу...")).not.toBeInTheDocument());
  });
});
