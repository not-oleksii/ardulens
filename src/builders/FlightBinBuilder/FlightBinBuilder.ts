import { DataflashBuilder } from "../DataflashBuilder/DataflashBuilder";

/**
 * Fluent builder for a synthetic-but-realistic single-flight ArduPilot DataFlash
 * (.bin) buffer. Message/field names mirror a real Skyline/ArduPlane log (BAT,
 * CTUN, ARSP, ARM, MODE, POS, PARM), confirmed against a real board's FMT
 * declarations - but every value here is made up, so this is safe to use in
 * tests and as in-app sample data without touching anyone's actual flight data.
 *
 * There's no `.withBoard()` - a real .bin has no board id in it, which is why
 * parseBin() takes `board` as a separate argument. Pass it there instead.
 */
const BAT = 1;
const CTUN = 2;
const ARSP = 3;
const ARM = 4;
const MODE = 5;
const POS = 6;
const PARM = 7;
const ATT = 8;
const RCIN = 9;
const IMU = 10;

const AIR_MODE_NUM = 5; // matches AIR_MODES in constants.ts (FBWA)

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/** Piecewise-linear interpolation between (fraction, value) control points. */
function piecewise(points: ReadonlyArray<readonly [number, number]>, frac: number): number {
  for (let i = 0; i < points.length - 1; i++) {
    const [f0, v0] = points[i]!;
    const [f1, v1] = points[i + 1]!;
    if (frac <= f1) return lerp(v0, v1, (frac - f0) / (f1 - f0));
  }
  return points[points.length - 1]![1];
}

export class FlightBinBuilder {
  private durationSec = 300;
  private takeoffVoltage = 25.2;
  private sagVoltage = 24.0; // ~5% drop: healthy by default, no advisor warning
  private landingVoltage = 23.0;
  private maxAirspeed = 18;
  private maxAltitude = 100;
  private maxCurrent = 22;
  private base = { lat: 50.0, lon: 30.0 };
  private teleportCount = 0;
  private grounded = false;
  private params: Array<{ name: string; value: number }> = [];

  withDurationSeconds(seconds: number): this {
    this.durationSec = seconds;
    return this;
  }

  /** Voltage at takeoff, at the first full-throttle sample, and at landing. */
  withVoltageCurve(takeoff: number, sag: number, landing: number): this {
    this.takeoffVoltage = takeoff;
    this.sagVoltage = sag;
    this.landingVoltage = landing;
    return this;
  }

  withMaxAirspeed(metersPerSecond: number): this {
    this.maxAirspeed = metersPerSecond;
    return this;
  }

  withMaxAltitude(meters: number): this {
    this.maxAltitude = meters;
    return this;
  }

  withMaxCurrent(amps: number): this {
    this.maxCurrent = amps;
    return this;
  }

  withBase(lat: number, lon: number): this {
    this.base = { lat, lon };
    return this;
  }

  /** Injects N brief, far-away GPS spikes that cleanTrack() must reject. */
  withGpsTeleports(count: number): this {
    this.teleportCount = count;
    return this;
  }

  /** Never crosses the airborne threshold - parseBin should report no flight. */
  groundedOnly(): this {
    this.grounded = true;
    return this;
  }

  withParam(name: string, value: number): this {
    this.params.push({ name, value });
    return this;
  }

  build(): ArrayBuffer {
    const b = new DataflashBuilder()
      .defineFormat(BAT, "BAT", ["Q", "f", "f"], ["TimeUS", "Volt", "Curr"])
      .defineFormat(CTUN, "CTUN", ["Q", "f"], ["TimeUS", "ThO"])
      .defineFormat(ARSP, "ARSP", ["Q", "f"], ["TimeUS", "Airspeed"])
      .defineFormat(ARM, "ARM", ["Q", "B"], ["TimeUS", "ArmState"])
      .defineFormat(MODE, "MODE", ["Q", "B"], ["TimeUS", "ModeNum"])
      .defineFormat(POS, "POS", ["Q", "d", "d", "f"], ["TimeUS", "Lat", "Lng", "RelHomeAlt"])
      .defineFormat(PARM, "PARM", ["Q", "N", "f"], ["TimeUS", "Name", "Value"])
      .defineFormat(ATT, "ATT", ["Q", "f", "f", "f"], ["TimeUS", "Roll", "Pitch", "Yaw"])
      .defineFormat(RCIN, "RCIN", ["Q", "f", "f", "f", "f"], ["TimeUS", "C1", "C2", "C3", "C4"])
      .defineFormat(
        IMU,
        "IMU",
        ["Q", "f", "f", "f", "f", "f", "f"],
        ["TimeUS", "GyrX", "GyrY", "GyrZ", "AccX", "AccY", "AccZ"],
      );

    const durationUS = this.durationSec * 1e6;
    b.addRecord(ARM, [0, 1]).addRecord(ARM, [durationUS, 0]);

    const maxAlt = this.grounded ? Math.min(5, this.maxAltitude) : this.maxAltitude;
    const maxAirspeed = this.grounded ? Math.min(3, this.maxAirspeed) : this.maxAirspeed;

    const voltageCurve: Array<[number, number]> = [
      [0, this.takeoffVoltage],
      [0.1, this.sagVoltage],
      [0.4, lerp(this.sagVoltage, this.takeoffVoltage, 0.6)],
      [1, this.landingVoltage],
    ];
    const throttleCurve: Array<[number, number]> = [
      [0, 0],
      [0.1, 100],
      [0.11, 100],
      [0.8, 60],
      [0.95, 20],
      [1, 0],
    ];

    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const t = frac * durationUS;

      b.addRecord(BAT, [t, piecewise(voltageCurve, frac), this.maxCurrent * Math.sin(Math.PI * frac)]);
      const throttlePct = piecewise(throttleCurve, frac);
      b.addRecord(CTUN, [t, throttlePct]);

      const airspeed =
        frac < 0.1 ? (frac / 0.1) * maxAirspeed : frac > 0.9 ? ((1 - frac) / 0.1) * maxAirspeed : maxAirspeed;
      b.addRecord(ARSP, [t, Math.max(0, airspeed)]);

      const mode = frac < 0.02 || frac > 0.98 ? 0 : AIR_MODE_NUM;
      b.addRecord(MODE, [t, mode]);

      const roll = 15 * Math.sin(frac * Math.PI * 4);
      const pitch = 5 * Math.sin(frac * Math.PI * 2);
      const yaw = (frac * 360) % 360;
      b.addRecord(ATT, [t, roll, pitch, yaw]);
      b.addRecord(RCIN, [t, 1500 + roll * 10, 1500 + pitch * 10, 1000 + throttlePct * 10, 1500]);
      b.addRecord(IMU, [
        t,
        Math.sin(frac * Math.PI * 6) * 0.05,
        Math.cos(frac * Math.PI * 6) * 0.05,
        0.02,
        Math.sin(frac * Math.PI * 3) * 0.3,
        Math.cos(frac * Math.PI * 3) * 0.3,
        -9.81,
      ]);
    }

    // POS needs much finer sampling than the other streams: holdMerge holds the
    // last record's value with no interpolation, so coarse steps would look like
    // a series of large instantaneous jumps and get rejected by cleanTrack's own
    // speed filter - not because anything is actually wrong with the track.
    for (let sec = 0; sec <= this.durationSec; sec += 1) {
      const frac = sec / this.durationSec;
      const t = sec * 1e6;
      const alt =
        frac < 0.15 ? (frac / 0.15) * maxAlt : frac > 0.85 ? ((1 - frac) / 0.15) * maxAlt : maxAlt;
      const bearingFrac = Math.sin(frac * Math.PI); // walk away from base and back
      b.addRecord(POS, [t, this.base.lat + bearingFrac * 0.01, this.base.lon + bearingFrac * 0.015, Math.max(0, alt)]);
    }

    // A far-away spike exactly on a 1-second tick - the per-second POS record
    // right after it naturally overwrites it before the next tick, so each
    // spike contributes exactly one rejected point to trackStats().removed.
    for (let k = 0; k < this.teleportCount; k++) {
      const tSec = 5 + k * 3;
      const tUS = tSec * 1e6;
      if (tUS >= durationUS) break;
      b.addRecord(POS, [tUS, this.base.lat + 5, this.base.lon + 5, maxAlt]);
    }

    this.params.forEach((p, i) => b.addRecord(PARM, [i * 1_000_000, p.name, p.value]));

    return b.build();
  }
}
