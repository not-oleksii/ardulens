import type { MavLinkData } from "mavlink-mappings/dist/lib/mavlink";
import { decodeOnePacket } from "../../mavlink/framer/framer";
import { GlobalPositionInt, Heartbeat, MavModeFlag, SysStatus, VfrHud } from "../../mavlink/registry/registry";
import type { ParseOpts, ParseResult, Sample } from "../../types";
import { isFlightSamples } from "../../analysis/metrics/metrics";

// A real, standard Mission Planner/pymavlink-compatible .tlog record: an 8-byte big-endian
// microsecond-since-Unix-epoch timestamp immediately followed by one complete raw MAVLink
// packet (no other framing) - confirmed against both pymavlink's own mavutil.mavlogfile
// (mavutil.py's pre_message/post_message) and Mission Planner's own MAVLinkInterface.cs
// (SaveToTlog), not guessed. See telemetryRecorder.ts for the write side.
const TIMESTAMP_LENGTH = 8;

interface MavRecord {
  tsMs: number;
  msgId: number;
  message: MavLinkData;
}

/** Walks a raw .tlog buffer's fixed {8-byte timestamp}{one packet} records. Unlike a live
 *  stream (MavlinkFramer's job), there's no garbage to resync past by construction - any
 *  record that doesn't decode cleanly means the file ends there (truncated write, or simply
 *  the actual end of file), so parsing just stops rather than scanning for the next valid
 *  byte. */
function walkTlogRecords(buf: ArrayBuffer): MavRecord[] {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  const records: MavRecord[] = [];
  let cursor = 0;

  while (cursor + TIMESTAMP_LENGTH <= u8.length) {
    const tsUs = dv.getBigUint64(cursor, false); // big-endian, per the real format above
    const packetStart = cursor + TIMESTAMP_LENGTH;
    const result = decodeOnePacket(u8.subarray(packetStart));
    if (result.kind !== "ok") break;

    records.push({ tsMs: Number(tsUs) / 1000, msgId: result.packet.msgId, message: result.packet.message });
    cursor = packetStart + result.length;
  }

  return records;
}

/** Real ArduPilot factory-default-adjacent armed-window detection, mirroring dataflash-bin.ts's
 *  own `binWindows()` (same >60s minimum duration filter, same <30s re-arm-gap merging) but
 *  driven by HEARTBEAT's own SAFETY_ARMED bit (a live session's only armed/disarmed signal)
 *  instead of a dataflash log's dedicated ARM message pairs. */
function armWindows(heartbeats: Array<{ tsMs: number; armed: boolean }>): Array<[number, number]> {
  const segs: Array<[number, number]> = [];
  let start: number | null = null;
  let wasArmed = false;
  for (const hb of heartbeats) {
    if (hb.armed && !wasArmed) start = hb.tsMs;
    else if (!hb.armed && wasArmed && start !== null) {
      segs.push([start, hb.tsMs]);
      start = null;
    }
    wasArmed = hb.armed;
  }
  // Still armed when the recording stopped (e.g. "Stop Recording" hit before landing/disarm) -
  // the window just ends at the last heartbeat seen, same as a real flight this app's own
  // dataflash handling already accepts an in-progress window for.
  if (start !== null) segs.push([start, heartbeats[heartbeats.length - 1]!.tsMs]);

  let full = segs.filter((s) => s[1] - s[0] > 60_000);
  if (full.length > 1) {
    const merged: Array<[number, number]> = [full[0]!];
    for (let i = 1; i < full.length; i++) {
      const last = merged[merged.length - 1]!;
      if (full[i]![0] - last[1] < 30_000) merged[merged.length - 1] = [last[0], full[i]![1]];
      else merged.push(full[i]!);
    }
    full = merged;
  }
  return full;
}

/** "Show anyway" fallback: the whole file's timestamp range, used as a single synthetic
 *  window when the vehicle was never seen armed for long enough (mirrors dataflash-bin.ts's
 *  own wholeFileWindow()). */
function wholeFileWindow(records: MavRecord[]): [number, number] | null {
  if (!records.length) return null;
  let lo = records[0]!.tsMs;
  let hi = records[0]!.tsMs;
  for (const r of records) {
    if (r.tsMs < lo) lo = r.tsMs;
    if (r.tsMs > hi) hi = r.tsMs;
  }
  return hi > lo ? [lo, hi] : null;
}

interface TimedValue {
  t: number;
  v: number | undefined;
}

/** Same sample-and-hold join dataflash-bin.ts's own `holdMerge()` uses, adapted to
 *  milliseconds (a .tlog's own real wall-clock unit) instead of dataflash's microseconds -
 *  not shared code between the two, since the unit and source data differ enough that sharing
 *  would need its own conversion-layer indirection for no real benefit at this size. */
function holdMerge(s: number, e: number, streams: Record<string, TimedValue[]>): Sample[] {
  const ptr: Record<string, number> = {};
  for (const k in streams) ptr[k] = 0;

  const samples: Sample[] = [];
  for (let t = s; t <= e; t += 100) {
    const smp: Record<string, number> = { t };
    for (const kk in streams) {
      const arr = streams[kk]!;
      while (ptr[kk]! + 1 < arr.length && arr[ptr[kk]! + 1]!.t <= t) ptr[kk]!++;
      const cur = arr[ptr[kk]!];
      if (cur && cur.t <= t && cur.v !== undefined) smp[kk] = cur.v;
    }
    samples.push(smp as unknown as Sample);
  }
  return samples;
}

/** Parses a recorded live-telemetry .tlog into this app's normal Flight/Sample model - the
 *  same shape `parseBin`'s dataflash reader produces, so a recorded session works with the
 *  existing Logs table and Graphs' telemetry series/advisor findings unchanged. Necessarily
 *  sparser than a real dataflash log: only the handful of live MAVLink messages ArduPilotSetupView
 *  already decodes during a session are available (HEARTBEAT for mode/armed state, SYS_STATUS
 *  for battery, VFR_HUD for airspeed/throttle, GLOBAL_POSITION_INT for position/altitude) - no
 *  IMU/BAT/CTUN-level dataflash detail exists in a live MAVLink stream at all, so this is a
 *  genuinely different (not degraded) kind of source, matching how `.skylog`'s own sparser
 *  Sample set already works fine with the same downstream metrics/advisors pipeline. */
export function parseTlog(buf: ArrayBuffer, board?: string, opts?: ParseOpts): ParseResult {
  const records = walkTlogRecords(buf);
  if (!records.length) return { info: "У записі немає розпізнаних MAVLink-пакетів." };

  const heartbeatRecords = records.filter((r) => r.msgId === Heartbeat.MSG_ID).map((r) => ({ tsMs: r.tsMs, m: r.message as Heartbeat }));
  const heartbeats = heartbeatRecords.map((r) => ({ tsMs: r.tsMs, armed: (r.m.baseMode & MavModeFlag.SAFETY_ARMED) !== 0 }));
  let wins = armWindows(heartbeats);
  if (!wins.length) {
    const whole = opts?.forceWholeFile ? wholeFileWindow(records) : null;
    if (!whole) return { info: "У записаній сесії апарат жодного разу не був озброєний достатньо довго для вильоту." };
    wins = [whole];
  }

  const sysStatus = records.filter((r) => r.msgId === SysStatus.MSG_ID).map((r) => ({ tsMs: r.tsMs, m: r.message as SysStatus }));
  const vfrHud = records.filter((r) => r.msgId === VfrHud.MSG_ID).map((r) => ({ tsMs: r.tsMs, m: r.message as VfrHud }));
  const position = records
    .filter((r) => r.msgId === GlobalPositionInt.MSG_ID)
    .map((r) => ({ tsMs: r.tsMs, m: r.message as GlobalPositionInt }));

  const mk = <T,>(arr: Array<{ tsMs: number; m: T }>, vk: (m: T) => number | undefined): TimedValue[] =>
    arr.map((x) => ({ t: x.tsMs, v: vk(x.m) }));

  const bd = board || "?";
  const flights = wins
    .map(([s, e]) => {
      const streams: Record<string, TimedValue[]> = {
        voltage: mk(sysStatus, (m) => m.voltageBattery / 1000),
        current: mk(sysStatus, (m) => (m.currentBattery >= 0 ? m.currentBattery / 100 : undefined)),
        airspeed: mk(vfrHud, (m) => m.airspeed),
        throttle: mk(vfrHud, (m) => m.throttle),
        alt: mk(position, (m) => m.relativeAlt / 1000),
        lat: mk(position, (m) => m.lat / 1e7),
        lon: mk(position, (m) => m.lon / 1e7),
        mode: mk(heartbeatRecords, (m) => m.customMode),
      };
      for (const k in streams) streams[k]!.sort((a, b) => a.t - b.t);

      return { board: bd, timeReliable: true, fmt: "tlog" as const, samples: holdMerge(s, e, streams) };
    })
    .filter((f) => opts?.forceWholeFile || isFlightSamples(f.samples));

  if (!flights.length) return { info: "У записаній сесії немає вильоту з достатньою кількістю телеметрії." };
  return { flights, boards: [bd], fmt: "tlog" };
}
