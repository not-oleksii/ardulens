import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodePacket } from "../../../mavlink/codec/codec";
import { Heartbeat, MavAutopilot, MavModeFlag, MavState, MavType } from "../../../mavlink/registry/registry";
import { isParsedFlights, isParsedInfo } from "../../../types";
import { parseTlog } from "../../../parsers/tlog/tlog";
import { DATA_EVENT, sendBytes } from "../../mavlinkTransport/mavlinkTransport";
import { startTelemetryRecording } from "../telemetryRecorder";

function heartbeatBytes(armed: boolean, seq: number): number[] {
  const hb = new Heartbeat();
  hb.type = MavType.QUADROTOR;
  hb.autopilot = MavAutopilot.ARDUPILOTMEGA;
  hb.baseMode = armed ? MavModeFlag.SAFETY_ARMED : (0 as MavModeFlag);
  hb.customMode = 0;
  hb.systemStatus = armed ? MavState.ACTIVE : MavState.STANDBY;
  hb.mavlinkVersion = 3;
  return Array.from(encodePacket(hb, { seq, sysid: 1, compid: 1 }));
}

beforeEach(() => {
  mockWindows("main");
  mockIPC(() => undefined, { shouldMockEvents: true });
});

afterEach(() => {
  clearMocks();
});

describe("startTelemetryRecording", () => {
  it("captures both incoming (vehicle) and outgoing (GCS) packets into a real, parseable .tlog", async () => {
    const handle = startTelemetryRecording();
    // onData's real-Tauri-event registration (as opposed to its synchronous local-bus
    // registration) is itself async - this recorder deliberately doesn't await it (so no
    // early data is missed once it does land, see the recorder's own comment), but this test
    // needs it to have actually landed before emitting, unlike the app's own natural mount ->
    // connect -> first-telemetry timeline which already gives it plenty of room.
    await new Promise((resolve) => setTimeout(resolve, 0));

    await emit(DATA_EVENT, { bytes: heartbeatBytes(false, 1) }); // vehicle -> GCS
    await sendBytes(encodePacket(new Heartbeat(), { seq: 1, sysid: 255, compid: 190 })); // GCS -> vehicle
    await emit(DATA_EVENT, { bytes: heartbeatBytes(true, 2) });

    const stats = handle.getStats();
    expect(stats.packetCount).toBe(3);
    expect(stats.byteCount).toBeGreaterThan(0);

    const tlogBytes = handle.stop();
    // 8-byte timestamp prefix per record, on top of each real packet's own length.
    expect(tlogBytes.length).toBe(stats.byteCount);

    const parsed = parseTlog(tlogBytes.buffer as ArrayBuffer);
    // Only one real HEARTBEAT(armed) here, far under the 60s minimum flight-window duration -
    // the point of this test is that the bytes are real/parseable, not that they form a flight.
    expect(isParsedInfo(parsed) || isParsedFlights(parsed)).toBe(true);
  });

  it("stops listening once stopped - later traffic isn't captured", async () => {
    const handle = startTelemetryRecording();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await emit(DATA_EVENT, { bytes: heartbeatBytes(false, 1) });
    const beforeStop = handle.getStats().packetCount;
    handle.stop();

    await emit(DATA_EVENT, { bytes: heartbeatBytes(false, 2) });
    await sendBytes(encodePacket(new Heartbeat(), { seq: 2, sysid: 255, compid: 190 }));

    expect(handle.getStats().packetCount).toBe(beforeStop);
  });

  it("returns an empty buffer when nothing was ever sent/received", () => {
    const handle = startTelemetryRecording();
    const tlogBytes = handle.stop();
    expect(tlogBytes.length).toBe(0);
  });
});
