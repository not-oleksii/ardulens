import { render, screen } from "@testing-library/react";
import { createElement, useState, type DragEvent } from "react";
import { describe, expect, it } from "vitest";
import { dropFile } from "../dropFile";

/** A minimal dropzone-shaped component, just enough to exercise dropFile(). */
function TestDropzone() {
  const [name, setName] = useState<string | null>(null);
  return createElement(
    "div",
    {
      "data-testid": "test-dropzone",
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) setName(file.name);
      },
      onDragOver: (e: DragEvent) => e.preventDefault(),
    },
    name ?? "empty",
  );
}

describe("dropFile", () => {
  it("dispatches a drop event carrying the given file onto the target testid", () => {
    render(createElement(TestDropzone));
    const file = new File(["hello"], "sample.bin");

    dropFile("test-dropzone", file);

    expect(screen.getByTestId("test-dropzone")).toHaveTextContent("sample.bin");
  });
});
