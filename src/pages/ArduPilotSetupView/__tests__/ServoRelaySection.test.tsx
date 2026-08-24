import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ServoRelaySection } from "../ServoRelaySection";

function getView(servoOutputs: Record<number, number> = {}) {
  const user = userEvent.setup();
  const onSetServoPwm = vi.fn();
  const onSetRelay = vi.fn();
  const utils = render(<ServoRelaySection servoOutputs={servoOutputs} onSetServoPwm={onSetServoPwm} onSetRelay={onSetRelay} />);
  return { user, onSetServoPwm, onSetRelay, ...utils };
}

describe("ServoRelaySection", () => {
  it("shows the safety warning and all 16 servo channels", () => {
    getView();
    expect(screen.getByText(/зніміть гвинти/i)).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    // header + 16 channel rows
    expect(rows).toHaveLength(17);
  });

  it("shows all 6 relay toggle buttons, defaulting to OFF", () => {
    getView();
    expect(screen.getAllByText("ВИМК")).toHaveLength(6);
    expect(screen.queryByText("УВІМК")).not.toBeInTheDocument();
  });

  it("shows a channel's live output from servoOutputs", () => {
    getView({ 3: 1650 });
    const rows = screen.getAllByRole("row");
    const row3 = rows.find((r) => within(r).queryByText("3"));
    expect(within(row3!).getByText("1650")).toBeInTheDocument();
  });

  it("dragging a channel's slider sends the new PWM immediately", () => {
    const { onSetServoPwm } = getView();
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0]!, { target: { value: "1800" } });
    expect(onSetServoPwm).toHaveBeenCalledWith(1, 1800);
  });

  it("editing the numeric field commits a clamped value on Enter", async () => {
    const { user, onSetServoPwm } = getView();
    const rows = screen.getAllByRole("row");
    const row1 = rows.find((r) => within(r).queryByText("1"))!;
    // The row has two "1500"-valued inputs (the range slider and the numeric field) - scoped to
    // role "textbox" since the slider's own role is "slider", not "textbox".
    const input = within(row1).getByRole("textbox");
    await user.clear(input);
    await user.type(input, "9999{Enter}");
    expect(onSetServoPwm).toHaveBeenLastCalledWith(1, 2000); // clamped to DEFAULT_MAX
  });

  it("Release returns a channel to trim and clears its draft", async () => {
    const { user, onSetServoPwm } = getView();
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0]!, { target: { value: "1800" } });
    const rows = screen.getAllByRole("row");
    const row1 = rows.find((r) => within(r).queryByText("1"))!;
    await user.click(within(row1).getByRole("button", { name: "Відпустити" }));
    expect(onSetServoPwm).toHaveBeenLastCalledWith(1, 1500);
    expect(within(row1).getByRole("textbox")).toHaveValue("1500");
  });

  it("clicking a relay button toggles it on, then off, sending the matching instance/state", async () => {
    const { user, onSetRelay } = getView();
    const relay1Row = screen.getByText("Реле 1").closest("div")!;
    const toggle = within(relay1Row).getByRole("button");

    await user.click(toggle);
    expect(onSetRelay).toHaveBeenLastCalledWith(1, true);
    expect(within(relay1Row).getByText("УВІМК")).toBeInTheDocument();

    await user.click(toggle);
    expect(onSetRelay).toHaveBeenLastCalledWith(1, false);
    expect(within(relay1Row).getByText("ВИМК")).toBeInTheDocument();
  });

  it("releases only the servo channels actually touched, on unmount", () => {
    const { onSetServoPwm, unmount } = getView();
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[2]!, { target: { value: "1700" } }); // channel 3
    onSetServoPwm.mockClear();

    unmount();

    expect(onSetServoPwm).toHaveBeenCalledTimes(1);
    expect(onSetServoPwm).toHaveBeenCalledWith(3, 1500);
  });

  it("does not release any channel on unmount if none were touched", () => {
    const { onSetServoPwm, unmount } = getView();
    unmount();
    expect(onSetServoPwm).not.toHaveBeenCalled();
  });
});
