import { fireEvent, screen } from "@testing-library/react";

/**
 * Simulates a real drag-and-drop of `file` onto the element with the given data-testid.
 * `fireEvent.drop` already wraps dispatch in `act()`, so this is the one worth keeping as
 * a shared one-liner rather than each component test file's own getView() re-implementing
 * the event construction.
 */
export function dropFile(dropzoneTestId: string, file: File): void {
  fireEvent.drop(screen.getByTestId(dropzoneTestId), { dataTransfer: { files: [file] } });
}
