import { MavType } from "../../mavlink/registry/registry";

export type ArduPilotVehicleFolder = "ArduCopter" | "ArduPlane" | "Rover" | "ArduSub" | "AntennaTracker";

export interface ParamDoc {
  /** Short human-readable title, e.g. "Throttle filter cutoff" for PILOT_THR_FILT. */
  humanName: string;
  /** The full documentation sentence(s) ArduPilot ships for this parameter. */
  documentation: string;
  /** For enum-typed params (e.g. SERVO1_FUNCTION), the real code->label list ArduPilot ships
   *  in its own pdef.xml - absent for non-enum params. */
  values?: Record<number, string>;
}

export type ParamDocsMap = Record<string, ParamDoc>;

// Confirmed reachable and CORS-open (Access-Control-Allow-Origin: *) - this is the same
// machine-readable metadata Mission Planner/MAVProxy ship with, auto-generated from
// ArduPilot's own source comments. "Rover" 302-redirects to the legacy "APMrover2" path
// server-side; fetch() follows redirects by default so this doesn't need to be hardcoded.
const PDEF_XML_URL = (folder: ArduPilotVehicleFolder) => `https://autotest.ardupilot.org/Parameters/${folder}/apm.pdef.xml`;

// Each vehicle firmware's docs live under its own path segment on ardupilot.org (verified:
// "sub", not "ardusub", is the real one for ArduSub).
const DOCS_PAGE_PATH: Record<ArduPilotVehicleFolder, string> = {
  ArduCopter: "copter",
  ArduPlane: "plane",
  Rover: "rover",
  ArduSub: "sub",
  AntennaTracker: "antennatracker",
};

/**
 * Deep-links to a parameter's entry on ardupilot.org's parameter docs page. Works for the
 * common case (a parameter with one definition, whose docs anchor is just the lowercased
 * name) - parameters redefined per-frame/backend (e.g. ATC_RAT_RLL_P for both
 * AC_AttitudeControl_Multi and _Heli) don't have a bare anchor matching this pattern, so the
 * link degrades gracefully to the top of the page rather than a broken URL in that case.
 */
export function paramDocsPageUrl(folder: ArduPilotVehicleFolder, paramName: string): string {
  const anchor = paramName.toLowerCase().replace(/_/g, "-");
  return `https://ardupilot.org/${DOCS_PAGE_PATH[folder]}/docs/parameters.html#${anchor}`;
}

/** Maps a HEARTBEAT's vehicle type to the ArduPilot firmware family that documents its parameters. */
export function vehicleFolderForMavType(type: MavType): ArduPilotVehicleFolder {
  switch (type) {
    case MavType.FIXED_WING:
      return "ArduPlane";
    case MavType.GROUND_ROVER:
    case MavType.SURFACE_BOAT:
      return "Rover";
    case MavType.SUBMARINE:
      return "ArduSub";
    case MavType.ANTENNA_TRACKER:
      return "AntennaTracker";
    default:
      // Covers QUADROTOR/HEXAROTOR/OCTOROTOR/TRICOPTER/COAXIAL/HELICOPTER, and is a
      // reasonable fallback for anything else (GENERIC, etc.) - ArduCopter is this
      // project's other well-supported vehicle family (see PLANE_MODE_NAMES' Plane-only
      // counterpart in constants.ts).
      return "ArduCopter";
  }
}

/** Extracts {name -> doc} from a real apm.pdef.xml document's text. */
export function parsePdefXml(xmlText: string): ParamDocsMap {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const docs: ParamDocsMap = {};
  for (const paramEl of Array.from(doc.getElementsByTagName("param"))) {
    const rawName = paramEl.getAttribute("name");
    if (!rawName) continue;
    // Vehicle-section entries are prefixed "ArduCopter:PARAM_NAME"; library-section entries
    // (e.g. "GPS_TYPE") aren't prefixed at all - strip the prefix only when present so both
    // match the live PARAM_VALUE's unprefixed param_id.
    const colonIndex = rawName.indexOf(":");
    const name = colonIndex === -1 ? rawName : rawName.slice(colonIndex + 1);
    if (docs[name]) continue; // first definition wins for params redefined per-frame/backend

    const valuesEl = paramEl.getElementsByTagName("values")[0];
    let values: Record<number, string> | undefined;
    if (valuesEl) {
      values = {};
      for (const valueEl of Array.from(valuesEl.getElementsByTagName("value"))) {
        const code = valueEl.getAttribute("code");
        if (code === null) continue;
        values[Number(code)] = valueEl.textContent ?? "";
      }
    }

    docs[name] = {
      humanName: paramEl.getAttribute("humanName") ?? name,
      documentation: paramEl.getAttribute("documentation") ?? "",
      ...(values ? { values } : {}),
    };
  }
  return docs;
}

const CACHE_KEY_PREFIX = "ardulens.paramDocs.";
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // ArduPilot's own docs change slowly

interface CacheEntry {
  fetchedAt: number;
  docs: ParamDocsMap;
}

function readPersistedCache(folder: ArduPilotVehicleFolder): ParamDocsMap | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + folder);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.fetchedAt > CACHE_MAX_AGE_MS) return null;
    return entry.docs;
  } catch {
    return null;
  }
}

function writePersistedCache(folder: ArduPilotVehicleFolder, docs: ParamDocsMap): void {
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + folder, JSON.stringify({ fetchedAt: Date.now(), docs } satisfies CacheEntry));
  } catch {
    // Best-effort - if storage is full/unavailable, descriptions just won't persist across sessions.
  }
}

const inMemoryCache = new Map<ArduPilotVehicleFolder, ParamDocsMap>();
const inFlightFetches = new Map<ArduPilotVehicleFolder, Promise<ParamDocsMap>>();

/**
 * Fetches (or returns the cached copy of) a vehicle family's parameter documentation.
 * Three-tier cache: in-memory (this session), localStorage (across app launches, ~1MB of
 * JSON rather than the ~2.7MB raw XML), then a real network fetch as a last resort - the
 * XML is large enough that re-downloading it every time the Parameters section is opened
 * would be wasteful, especially over a vehicle's own slow serial/UDP link sharing the same
 * network path in some setups.
 */
export async function fetchParamDocs(folder: ArduPilotVehicleFolder): Promise<ParamDocsMap> {
  const cached = inMemoryCache.get(folder);
  if (cached) return cached;

  const inFlight = inFlightFetches.get(folder);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const persisted = readPersistedCache(folder);
    if (persisted) {
      inMemoryCache.set(folder, persisted);
      return persisted;
    }

    const response = await fetch(PDEF_XML_URL(folder));
    if (!response.ok) throw new Error(`Failed to fetch parameter documentation (HTTP ${response.status})`);
    const xmlText = await response.text();
    const docs = parsePdefXml(xmlText);
    inMemoryCache.set(folder, docs);
    writePersistedCache(folder, docs);
    return docs;
  })();

  inFlightFetches.set(folder, promise);
  try {
    return await promise;
  } finally {
    inFlightFetches.delete(folder);
  }
}
