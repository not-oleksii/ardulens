import { afterEach, describe, expect, it } from "vitest";
import { MavSeverity } from "../../../mavlink/registry/registry";
import { useMavlinkStatusTextStore } from "../mavlinkStatusTextStore";
import type { StatusTextEntry } from "../types";

function entry(text: string, overrides: Partial<StatusTextEntry> = {}): StatusTextEntry {
  return { severity: MavSeverity.INFO, text, receivedAt: 1000, ...overrides };
}

describe("mavlinkStatusTextStore", () => {
  afterEach(() => {
    useMavlinkStatusTextStore.getState().reset();
  });

  it("defaults to no messages", () => {
    expect(useMavlinkStatusTextStore.getState().messages).toEqual([]);
  });

  it("adds messages most-recent-first", () => {
    useMavlinkStatusTextStore.getState().addMessage(entry("first"));
    useMavlinkStatusTextStore.getState().addMessage(entry("second"));

    const messages = useMavlinkStatusTextStore.getState().messages;
    expect(messages.map((m) => m.text)).toEqual(["second", "first"]);
  });

  it("caps the message list at 50, dropping the oldest", () => {
    for (let i = 0; i < 55; i++) {
      useMavlinkStatusTextStore.getState().addMessage(entry(`msg-${i}`));
    }

    const messages = useMavlinkStatusTextStore.getState().messages;
    expect(messages.length).toBe(50);
    expect(messages[0]!.text).toBe("msg-54"); // most recent kept
    expect(messages.at(-1)!.text).toBe("msg-5"); // the first 5 (0-4) were dropped
  });

  it("resets back to no messages", () => {
    useMavlinkStatusTextStore.getState().addMessage(entry("hello"));
    useMavlinkStatusTextStore.getState().reset();
    expect(useMavlinkStatusTextStore.getState().messages).toEqual([]);
  });
});
