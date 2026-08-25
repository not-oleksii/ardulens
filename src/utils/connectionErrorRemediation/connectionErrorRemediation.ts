type Translate = (key: string) => string;

// Ordered (first match wins) substring patterns against the RAW OS/Tauri/serialport-rs error
// string this app already shows as-is (see ArduPilotSetupView.tsx's setError call sites) - not
// an exhaustive parser, just the handful of failure modes real users actually hit, mapped to a
// plain-language next step. Patterns are deliberately broad substrings (not full error-message
// matches), since the exact wording varies by OS (Windows/macOS/Linux) and Tauri/serialport-rs
// version - matching the class of failure, not the precise string.
const PATTERNS: { pattern: RegExp; key: string }[] = [
  // Windows: "Access is denied." / macOS-Linux: "Permission denied" - either another program
  // already has the port open, or the user's account lacks serial port access (Linux dialout
  // group being the common case).
  { pattern: /access is denied|permission denied/i, key: "permissionDenied" },
  // "already in use", "resource busy", "device or resource busy" - a different program (another
  // GCS, a serial monitor, the Arduino IDE, etc.) currently holds the port open.
  { pattern: /already in use|resource busy/i, key: "portBusy" },
  // "no such file or directory", "cannot find the file specified", "could not open port" - the
  // port name is stale, most often because the board was unplugged/replugged since the port
  // list was last refreshed.
  { pattern: /no such file or directory|cannot find the file specified|could not open/i, key: "portNotFound" },
  // UDP/TCP: nothing is listening on the target host/port yet.
  { pattern: /connection refused/i, key: "connectionRefused" },
  // A generic OS-level timeout opening the transport itself (distinct from this app's own
  // AUTO_CONNECT_TIMEOUT_MS "no heartbeat" case, which never reaches this function - that one
  // already has its own copy, see autoConnectFailed).
  { pattern: /timed out|timeout/i, key: "timedOut" },
];

/** A short remediation hint for a raw connection-error string, or null if it doesn't match any
 *  known failure pattern - callers show this ALONGSIDE the raw message (never in place of it),
 *  since an unrecognized error is still worth seeing verbatim. */
export function connectionErrorRemediation(t: Translate, rawMessage: string): string | null {
  const match = PATTERNS.find(({ pattern }) => pattern.test(rawMessage));
  return match ? t(`ardupilotSetup.connect.remediation.${match.key}`) : null;
}
