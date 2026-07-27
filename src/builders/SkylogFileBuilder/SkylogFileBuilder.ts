/**
 * Fluent builder for a synthetic-but-realistic multi-board .skylog text file.
 * The telemetry line shape (field names) mirrors a real Skyline log - confirmed
 * against a real board's output - but every value here is made up, so this is
 * safe to use in tests and as in-app sample data without touching anyone's
 * actual flight data.
 */
interface BoardConfig {
  board: number;
  durationSec: number;
  takeoffVoltage: number;
  landingVoltage: number;
  maxAirspeed: number;
  maxAltitude: number;
  base: { lat: number; lon: number };
  airborne: boolean;
}

export interface SkylogBoardOptions {
  board: number;
  durationSec?: number;
  takeoffVoltage?: number;
  landingVoltage?: number;
  maxAirspeed?: number;
  maxAltitude?: number;
  base?: { lat: number; lon: number };
  /** Set false to keep alt/airspeed under the airborne thresholds (ground test). */
  airborne?: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

const SAMPLES_PER_BOARD = 40;

export class SkylogFileBuilder {
  private boards: BoardConfig[] = [];
  private extendedLog = true;

  addBoard(opts: SkylogBoardOptions): this {
    this.boards.push({
      durationSec: 300,
      takeoffVoltage: 25.2,
      landingVoltage: 23.5,
      maxAirspeed: 18,
      maxAltitude: 100,
      base: { lat: 50.0, lon: 30.0 },
      airborne: true,
      ...opts,
    });
    return this;
  }

  /** Produces a file with only the raw {tlm:...} line - the "missing -extended_log" error path. */
  withoutExtendedLog(): this {
    this.extendedLog = false;
    return this;
  }

  build(): ArrayBuffer {
    if (!this.extendedLog) {
      return new TextEncoder().encode('{tlm:"aa4ec921a6e3ef39eafd511542d60000ad9fffff0aff7c0864ee3fe5"}\n').buffer;
    }

    const lines: string[] = [];
    let clockMs = 1_700_000_000_000;

    for (const board of this.boards) {
      const maxAlt = board.airborne ? board.maxAltitude : Math.min(5, board.maxAltitude);
      const maxAirspeed = board.airborne ? board.maxAirspeed : Math.min(3, board.maxAirspeed);

      lines.push(`{setid:${board.board}}`);
      for (let i = 0; i <= SAMPLES_PER_BOARD; i++) {
        const frac = i / SAMPLES_PER_BOARD;
        const t = clockMs + Math.round(frac * board.durationSec * 1000);
        const armed = frac > 0.02 && frac < 0.98 ? 1 : 0;
        const mode = armed ? 5 : 0;
        const voltage = lerp(board.takeoffVoltage, board.landingVoltage, frac);
        const current = 5 + Math.sin(Math.PI * frac) * 15;
        const throttle = Math.round(lerp(0, 80, Math.min(1, frac / 0.1)));
        const alt =
          frac < 0.15 ? (frac / 0.15) * maxAlt : frac > 0.85 ? ((1 - frac) / 0.15) * maxAlt : maxAlt;
        const airspeed =
          frac < 0.1
            ? (frac / 0.1) * maxAirspeed
            : frac > 0.9
              ? ((1 - frac) / 0.1) * maxAirspeed
              : maxAirspeed;
        const bearingFrac = Math.sin(frac * Math.PI);
        const lat = board.base.lat + bearingFrac * 0.01;
        const lon = board.base.lon + bearingFrac * 0.015;

        lines.push(
          `{telemetry:"time:${t},mode:${mode},armed:${armed},alt:${alt.toFixed(1)},` +
            `airspeed:${Math.max(0, airspeed).toFixed(2)},throttle:${throttle},` +
            `voltage:${voltage.toFixed(2)},current:${current.toFixed(2)},` +
            `lat:${lat.toFixed(6)},lon:${lon.toFixed(6)}"}`,
        );
      }
      clockMs += board.durationSec * 1000 + 60_000; // gap before the next board's flight
    }

    return new TextEncoder().encode(lines.join("\n")).buffer;
  }
}
