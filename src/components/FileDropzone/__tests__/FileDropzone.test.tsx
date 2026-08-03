import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { dropFile } from "../../../test/dropFile";
import { FileDropzone } from "../FileDropzone";

function getView(overrides: Partial<ComponentProps<typeof FileDropzone>> = {}) {
  const user = userEvent.setup();
  const onFile = vi.fn();
  render(
    <FileDropzone
      testId="log"
      accept=".bin"
      isParsing={false}
      stage={null}
      onFile={onFile}
      title="Drop a file"
      subtitle="or click to browse"
      readingText="Reading..."
      parsingText="Parsing..."
      {...overrides}
    />,
  );

  const getDropzone = () => screen.getByTestId("log-dropzone");
  const getFileInput = () => screen.getByTestId("log-file-input");

  const uploadFile = (file: File) => user.upload(getFileInput(), file);
  const dropFileOnZone = (file: File) => dropFile("log-dropzone", file);
  const clickDropzone = () => user.click(getDropzone());

  return { user, onFile, getDropzone, getFileInput, uploadFile, dropFileOnZone, clickDropzone };
}

describe("FileDropzone", () => {
  it("shows title/subtitle when idle", () => {
    getView();
    expect(screen.getByText("Drop a file")).toBeInTheDocument();
    expect(screen.getByText("or click to browse")).toBeInTheDocument();
  });

  it("shows the reading text while stage is 'reading'", () => {
    getView({ isParsing: true, stage: "reading" });
    expect(screen.getByText("Reading...")).toBeInTheDocument();
    expect(screen.queryByText("Parsing...")).not.toBeInTheDocument();
  });

  it("shows the parsing text while stage is 'parsing'", () => {
    getView({ isParsing: true, stage: "parsing" });
    expect(screen.getByText("Parsing...")).toBeInTheDocument();
  });

  it("marks the dropzone aria-disabled and the input disabled while parsing", () => {
    const { getDropzone, getFileInput } = getView({ isParsing: true, stage: "parsing" });
    expect(getDropzone()).toHaveAttribute("aria-disabled", "true");
    expect(getFileInput()).toBeDisabled();
  });

  it("calls onFile when a file is chosen via the hidden input", async () => {
    const { uploadFile, onFile } = getView();
    const file = new File(["hello"], "sample.bin");

    await uploadFile(file);

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("calls onFile when a file is dropped", () => {
    const { dropFileOnZone, onFile } = getView();
    const file = new File(["hello"], "sample.bin");

    dropFileOnZone(file);

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("clicking the dropzone opens the file browser (delegates to the hidden input)", async () => {
    const { getFileInput, clickDropzone } = getView();
    const clickSpy = vi.spyOn(getFileInput(), "click");

    await clickDropzone();

    expect(clickSpy).toHaveBeenCalled();
  });
});
