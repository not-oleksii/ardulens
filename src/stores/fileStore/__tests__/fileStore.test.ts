import { afterEach, describe, expect, it } from "vitest";
import { useFileStore } from "../fileStore";

describe("fileStore", () => {
  afterEach(() => {
    useFileStore.getState().clearFile(); // reset for other tests
  });

  it("defaults to no file loaded", () => {
    expect(useFileStore.getState().file).toBeNull();
  });

  it("sets the loaded file", () => {
    const buf = new ArrayBuffer(4);
    useFileStore.getState().setFile({ name: "sample.bin", buf });
    expect(useFileStore.getState().file).toEqual({ name: "sample.bin", buf });
  });

  it("clears the loaded file", () => {
    useFileStore.getState().setFile({ name: "sample.bin", buf: new ArrayBuffer(4) });
    useFileStore.getState().clearFile();
    expect(useFileStore.getState().file).toBeNull();
  });
});
