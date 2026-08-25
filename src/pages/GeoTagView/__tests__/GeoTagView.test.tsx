import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataflashBuilder } from "../../../builders/DataflashBuilder/DataflashBuilder";
import { useFileStore } from "../../../stores/fileStore/fileStore";
import { GeoTagView } from "../GeoTagView";

interface MockDirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

// vi.mock's factory below is hoisted above these declarations - vi.hoisted() runs its own
// initializer before that hoisting, so the mocks it returns are already defined by the time
// the factory (and any of this file's own top-level code) can reference them.
const { mockOpen, mockInvoke, mockReadDir, mockReadFile, mockWriteFile, mockMkdir, mockExists } = vi.hoisted(() => ({
  mockOpen: vi.fn<(options?: { directory?: boolean; multiple?: boolean }) => Promise<string | null>>(),
  mockInvoke: vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>(),
  mockReadDir: vi.fn<(path: string) => Promise<MockDirEntry[]>>(),
  mockReadFile: vi.fn<(path: string) => Promise<Uint8Array>>(),
  mockWriteFile: vi.fn<(path: string, data: Uint8Array) => Promise<void>>(),
  mockMkdir: vi.fn<(path: string) => Promise<void>>(),
  mockExists: vi.fn<(path: string) => Promise<boolean>>(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mockOpen }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/path", () => ({ join: (...parts: string[]) => Promise.resolve(parts.join("/")) }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: mockReadDir,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  exists: mockExists,
}));

const CAM = 1;

function buildBinWithCamRecords(count: number): ArrayBuffer {
  const b = new DataflashBuilder().defineFormat(
    CAM,
    "CAM",
    ["Q", "d", "d", "f", "f", "f", "f", "f"],
    ["TimeUS", "Lat", "Lng", "Alt", "RelAlt", "R", "P", "Y"],
  );
  for (let i = 0; i < count; i++) b.addRecord(CAM, [i * 1e6, 50 + i * 0.001, 30 + i * 0.001, 100, 40, 0, 0, 0]);
  return b.build();
}

function dirEntry(name: string, isFile = true) {
  return { name, isFile, isDirectory: !isFile, isSymlink: false };
}

beforeEach(() => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
  mockInvoke.mockResolvedValue(undefined);
  mockExists.mockResolvedValue(false);
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  useFileStore.getState().clearFile();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

describe("GeoTagView", () => {
  it("shows a desktop-only message when not running under Tauri", () => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    render(<GeoTagView />);
    expect(screen.getByText(/GeoTag потребує десктопний застосунок/)).toBeInTheDocument();
  });

  it("shows the CAM record count once the log is parsed", async () => {
    useFileStore.getState().setFile({ name: "sample.bin", buf: buildBinWithCamRecords(3) });
    render(<GeoTagView />);
    expect(await screen.findByText(/У логу знайдено записів спрацювань камери: 3/)).toBeInTheDocument();
  });

  it("shows a warning when the log has no CAM records", async () => {
    useFileStore.getState().setFile({ name: "sample.bin", buf: buildBinWithCamRecords(0) });
    render(<GeoTagView />);
    expect(await screen.findByText(/не знайдено записів CAM/)).toBeInTheDocument();
  });

  it("picking a folder grants fs scope, lists only JPEGs sorted by name", async () => {
    useFileStore.getState().setFile({ name: "sample.bin", buf: buildBinWithCamRecords(2) });
    mockOpen.mockResolvedValue("/photos");
    mockReadDir.mockResolvedValue([
      dirEntry("b.jpg"),
      dirEntry("a.JPEG"),
      dirEntry("notes.txt"),
      dirEntry("sub", false),
    ]);
    const user = userEvent.setup();
    render(<GeoTagView />);
    await screen.findByText(/У логу знайдено записів спрацювань камери: 2/);

    await user.click(screen.getByRole("button", { name: "Виберіть папку з фото..." }));

    expect(mockInvoke).toHaveBeenCalledWith("grant_geotag_folder_access", { path: "/photos" });
    expect(await screen.findByText(/У папці знайдено JPEG-фото: 2/)).toBeInTheDocument();
    expect(screen.getByText("a.JPEG")).toBeInTheDocument();
    expect(screen.getByText("b.jpg")).toBeInTheDocument();
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
  });

  it("shows a mismatch error and hides GeoTag Images when photo/CAM counts differ", async () => {
    useFileStore.getState().setFile({ name: "sample.bin", buf: buildBinWithCamRecords(2) });
    mockOpen.mockResolvedValue("/photos");
    mockReadDir.mockResolvedValue([dirEntry("a.jpg")]);
    const user = userEvent.setup();
    render(<GeoTagView />);
    await screen.findByText(/У логу знайдено записів спрацювань камери: 2/);
    await user.click(screen.getByRole("button", { name: "Виберіть папку з фото..." }));

    expect(await screen.findByText(/Кількість фото \(1\) не збігається/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Геотегувати фото" })).not.toBeInTheDocument();
  });

  it("resets the picked photo folder when a different log is loaded, even if the new log happens to have the same CAM-record count", async () => {
    // Real bug: without a reset, loading a NEW log with the SAME CAM-record count as the OLD
    // photo folder's photo count would leave `canGeoTag` true with zero warning, silently
    // writing the wrong flight's GPS/altitude into that folder's EXIF data.
    useFileStore.getState().setFile({ name: "flight-a.bin", buf: buildBinWithCamRecords(2) });
    mockOpen.mockResolvedValue("/photos");
    mockReadDir.mockResolvedValue([dirEntry("a.jpg"), dirEntry("b.jpg")]);
    const user = userEvent.setup();
    render(<GeoTagView />);
    await screen.findByText(/У логу знайдено записів спрацювань камери: 2/);
    await user.click(screen.getByRole("button", { name: "Виберіть папку з фото..." }));
    await screen.findByText(/У папці знайдено JPEG-фото: 2/);
    expect(screen.getByRole("button", { name: "Геотегувати фото" })).toBeInTheDocument();

    // A different flight, but coincidentally also 2 CAM records - same count as the stale
    // photo folder above.
    useFileStore.getState().setFile({ name: "flight-b.bin", buf: buildBinWithCamRecords(2) });

    await waitFor(() => expect(screen.queryByText(/У папці знайдено JPEG-фото/)).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Геотегувати фото" })).not.toBeInTheDocument();
    expect(screen.queryByText("/photos")).not.toBeInTheDocument();
  });

  it("geotagging writes real EXIF-tagged bytes for each matched photo into a _geotagged subfolder", async () => {
    useFileStore.getState().setFile({ name: "sample.bin", buf: buildBinWithCamRecords(2) });
    mockOpen.mockResolvedValue("/photos");
    mockReadDir.mockResolvedValue([dirEntry("a.jpg"), dirEntry("b.jpg")]);
    const minimalJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x00, 0xff, 0xd9]);
    mockReadFile.mockResolvedValue(minimalJpeg);

    const user = userEvent.setup();
    render(<GeoTagView />);
    await screen.findByText(/У логу знайдено записів спрацювань камери: 2/);
    await user.click(screen.getByRole("button", { name: "Виберіть папку з фото..." }));
    await screen.findByText(/У папці знайдено JPEG-фото: 2/);

    await user.click(screen.getByRole("button", { name: "Геотегувати фото" }));

    await waitFor(() => expect(mockWriteFile).toHaveBeenCalledTimes(2));
    expect(mockMkdir).toHaveBeenCalledWith("/photos/_geotagged");
    expect(mockWriteFile.mock.calls[0]![0]).toBe("/photos/_geotagged/a.jpg");
    const writtenBytes = mockWriteFile.mock.calls[0]![1];
    expect(writtenBytes[0]).toBe(0xff);
    expect(writtenBytes[1]).toBe(0xd8);
    expect(await screen.findByText(/Геотеговано 2 \/ 2 фото/)).toBeInTheDocument();
  });
});
