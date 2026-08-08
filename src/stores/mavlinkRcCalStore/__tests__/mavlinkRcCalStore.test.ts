import { beforeEach, describe, expect, it } from "vitest";
import { useMavlinkRcCalStore } from "../mavlinkRcCalStore";

describe("mavlinkRcCalStore", () => {
  beforeEach(() => {
    useMavlinkRcCalStore.getState().reset();
  });

  it("updates `live` from observe() even while inactive, without populating `channels`", () => {
    useMavlinkRcCalStore.getState().observe({ 1: 1500, 3: 1000 }, 8);
    const state = useMavlinkRcCalStore.getState();
    expect(state.live).toEqual({ 1: 1500, 3: 1000 });
    expect(state.chanCount).toBe(8);
    expect(state.channels).toEqual({});
  });

  it("start() seeds a fresh capture, and the next observe() seeds min/max/trim from the first packet", () => {
    useMavlinkRcCalStore.getState().observe({ 1: 1500 }, 8);
    useMavlinkRcCalStore.getState().start();
    useMavlinkRcCalStore.getState().observe({ 1: 1500, 3: 1000 }, 8);

    const channels = useMavlinkRcCalStore.getState().channels;
    expect(channels[1]).toEqual({ min: 1500, max: 1500, trim: 1500, reversed: false });
    expect(channels[3]).toEqual({ min: 1000, max: 1000, trim: 1000, reversed: false });
  });

  it("expands min/max (but not trim) as the channel moves further, while active", () => {
    useMavlinkRcCalStore.getState().start();
    useMavlinkRcCalStore.getState().observe({ 1: 1500 }, 8);
    useMavlinkRcCalStore.getState().observe({ 1: 1000 }, 8);
    useMavlinkRcCalStore.getState().observe({ 1: 2000 }, 8);
    useMavlinkRcCalStore.getState().observe({ 1: 1600 }, 8);

    expect(useMavlinkRcCalStore.getState().channels[1]).toEqual({ min: 1000, max: 2000, trim: 1500, reversed: false });
  });

  it("start() discards a previous capture (channels reset) but keeps `live`", () => {
    useMavlinkRcCalStore.getState().start();
    useMavlinkRcCalStore.getState().observe({ 1: 1000 }, 8);
    useMavlinkRcCalStore.getState().start(); // restart

    const state = useMavlinkRcCalStore.getState();
    expect(state.channels).toEqual({});
    expect(state.live).toEqual({ 1: 1000 }); // live isn't cleared by start()
  });

  it("toggleReversed() flips only the given channel, and is a no-op for an unobserved channel", () => {
    useMavlinkRcCalStore.getState().start();
    useMavlinkRcCalStore.getState().observe({ 1: 1500, 2: 1500 }, 8);

    useMavlinkRcCalStore.getState().toggleReversed(1);
    let state = useMavlinkRcCalStore.getState();
    expect(state.channels[1]!.reversed).toBe(true);
    expect(state.channels[2]!.reversed).toBe(false);

    useMavlinkRcCalStore.getState().toggleReversed(1);
    state = useMavlinkRcCalStore.getState();
    expect(state.channels[1]!.reversed).toBe(false);

    useMavlinkRcCalStore.getState().toggleReversed(9); // never observed
    expect(useMavlinkRcCalStore.getState().channels[9]).toBeUndefined();
  });

  it("stop() clears active + channels but keeps `live`/`chanCount`", () => {
    useMavlinkRcCalStore.getState().start();
    useMavlinkRcCalStore.getState().observe({ 1: 1500 }, 8);
    useMavlinkRcCalStore.getState().stop();

    const state = useMavlinkRcCalStore.getState();
    expect(state.active).toBe(false);
    expect(state.channels).toEqual({});
    expect(state.live).toEqual({ 1: 1500 });
    expect(state.chanCount).toBe(8);
  });

  it("setLastCommandAck() stores the ack, reset() clears everything including `live`", () => {
    useMavlinkRcCalStore.getState().setLastCommandAck({ command: 241, result: 0 });
    expect(useMavlinkRcCalStore.getState().lastCommandAck).toEqual({ command: 241, result: 0 });

    useMavlinkRcCalStore.getState().observe({ 1: 1500 }, 8);
    useMavlinkRcCalStore.getState().reset();

    const state = useMavlinkRcCalStore.getState();
    expect(state.lastCommandAck).toBeNull();
    expect(state.live).toEqual({});
    expect(state.chanCount).toBe(0);
    expect(state.active).toBe(false);
  });
});
