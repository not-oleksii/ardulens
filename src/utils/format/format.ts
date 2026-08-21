export function r2(x: number | null): string {
  return x == null ? "" : x.toFixed(2);
}

export function r1(x: number | null): string {
  return x == null ? "" : x.toFixed(1);
}

export function r0(x: number | null): string {
  return x == null ? "" : String(Math.round(x));
}

export function fmtDurMs(ms: number): string {
  let m = Math.round(ms / 60000);
  if (m < 0) m = 0;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

/** Local wall-clock time (device timezone, not a fixed one) with seconds - for live-session
 *  events like STATUSTEXT messages, several of which can arrive within the same second (e.g.
 *  during boot), unlike fmtKyiv's minute-only precision for post-flight log timestamps. */
export function fmtTimeHms(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(ms));
}

export function fmtKyiv(ms: number): string {
  try {
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kyiv",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(ms));
  } catch {
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(ms));
  }
}
