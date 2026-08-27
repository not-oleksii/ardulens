import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Attitude } from "mavlink-mappings/dist/lib/common";
import { Heartbeat } from "mavlink-mappings/dist/lib/minimal";
import { beforeEach, describe, expect, it } from "vitest";
import { useMavlinkInspectorStore } from "../../../stores/mavlinkInspectorStore/mavlinkInspectorStore";
import type { InspectorEntry } from "../../../stores/mavlinkInspectorStore/types";
import { MavlinkInspectorSection } from "../MavlinkInspectorSection";

function heartbeatEntry(overrides: Partial<InspectorEntry> = {}): InspectorEntry {
  const hb = new Heartbeat();
  hb.type = 2;
  hb.autopilot = 3;
  hb.customMode = 0;
  return {
    msgId: Heartbeat.MSG_ID,
    name: Heartbeat.MSG_NAME,
    count: 12,
    hz: 1,
    countAtLastTick: 11,
    lastMessage: hb,
    lastReceivedAt: Date.now(),
    ...overrides,
  };
}

function attitudeEntry(overrides: Partial<InspectorEntry> = {}): InspectorEntry {
  const att = new Attitude();
  att.roll = 0.125;
  att.pitch = -0.5;
  att.yaw = 3.14159;
  return {
    msgId: Attitude.MSG_ID,
    name: Attitude.MSG_NAME,
    count: 340,
    hz: 10,
    countAtLastTick: 330,
    lastMessage: att,
    lastReceivedAt: Date.now(),
    ...overrides,
  };
}

function seedEntries(entries: Record<number, InspectorEntry>) {
  useMavlinkInspectorStore.setState({ entries });
}

describe("MavlinkInspectorSection", () => {
  beforeEach(() => {
    useMavlinkInspectorStore.getState().reset();
  });

  it("shows the empty-state message when no messages have been received", () => {
    render(<MavlinkInspectorSection />);
    expect(screen.getByText("Ще немає отриманих повідомлень.")).toBeInTheDocument();
  });

  it("lists every received message type, sorted by name, with id/count/hz columns", () => {
    seedEntries({
      [Heartbeat.MSG_ID]: heartbeatEntry(),
      [Attitude.MSG_ID]: attitudeEntry(),
    });
    render(<MavlinkInspectorSection />);
    const rows = screen.getAllByRole("button");
    expect(rows).toHaveLength(2);
    // ATTITUDE sorts before HEARTBEAT alphabetically.
    expect(within(rows[0]!).getByText("ATTITUDE")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("340")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("10")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("HEARTBEAT")).toBeInTheDocument();
  });

  it("filters the message list by name", async () => {
    const user = userEvent.setup();
    seedEntries({
      [Heartbeat.MSG_ID]: heartbeatEntry(),
      [Attitude.MSG_ID]: attitudeEntry(),
    });
    render(<MavlinkInspectorSection />);
    await user.type(screen.getByPlaceholderText("Фільтр за назвою повідомлення..."), "heart");
    expect(screen.getByText("HEARTBEAT")).toBeInTheDocument();
    expect(screen.queryByText("ATTITUDE")).not.toBeInTheDocument();
  });

  it("shows a prompt to select a message before any row is picked", () => {
    seedEntries({ [Heartbeat.MSG_ID]: heartbeatEntry() });
    render(<MavlinkInspectorSection />);
    expect(screen.getByText("Виберіть повідомлення, щоб побачити його поля.")).toBeInTheDocument();
  });

  it("clicking a message row shows its decoded fields with real wire-name labels", async () => {
    const user = userEvent.setup();
    seedEntries({ [Heartbeat.MSG_ID]: heartbeatEntry() });
    render(<MavlinkInspectorSection />);
    await user.click(screen.getByRole("button", { name: /HEARTBEAT/ }));
    expect(screen.getByText("type")).toBeInTheDocument();
    expect(screen.getByText("autopilot")).toBeInTheDocument();
    expect(screen.getByText("custom_mode")).toBeInTheDocument();
  });

  it("formats a non-integer field value with fixed precision rather than raw float noise", async () => {
    const user = userEvent.setup();
    seedEntries({ [Attitude.MSG_ID]: attitudeEntry() });
    render(<MavlinkInspectorSection />);
    await user.click(screen.getByRole("button", { name: /ATTITUDE/ }));
    expect(screen.getByText("0.1250")).toBeInTheDocument();
    expect(screen.getByText("-0.5000")).toBeInTheDocument();
  });

  it("keyboard-activates row selection on Enter", async () => {
    const user = userEvent.setup();
    seedEntries({ [Heartbeat.MSG_ID]: heartbeatEntry() });
    render(<MavlinkInspectorSection />);
    const row = screen.getByRole("button", { name: /HEARTBEAT/ });
    row.focus();
    await user.keyboard("{Enter}");
    expect(row).toHaveAttribute("aria-selected", "true");
  });
});
