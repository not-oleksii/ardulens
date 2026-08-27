/** A saved ground-station site's home position - null until the user actually places one on
 *  the map. `altitudeM` is above the WGS84 ellipsoid (matching how LiveMapSection/CesiumMapView
 *  already sample terrain height), auto-filled from the terrain at the clicked point but
 *  editable, same convention as this app's other "auto-sample, allow manual override" fields. */
export interface SiteHome {
  lat: number;
  lon: number;
  altitudeM: number;
}

export type DeviceKind = "beacon" | "antenna";
/** The device's top-down coverage-lobe shape - a deliberately simplified 2D approximation (see
 *  the Ground Station plan): "omni" is a circle, "dipole" is a figure-eight along `bearingDeg`,
 *  "directional" is a `beamwidthDeg`-wide sector centered on `bearingDeg`. Not a real 3D
 *  elevation+azimuth radiation pattern (a real dipole's pattern is a torus) - that's explicitly
 *  out of scope for ground-coverage planning at this level of detail. */
export type DevicePattern = "omni" | "dipole" | "directional";

/** One placed beacon (GPS-denial marker) or antenna (comms range) within a site. Both kinds
 *  share this one shape - `kind` only changes icon/preset choices/labeling, not the underlying
 *  fields, per the Ground Station plan's "same underlying device object" decision. */
export interface SiteDevice {
  id: string;
  kind: DeviceKind;
  name: string;
  lat: number;
  lon: number;
  /** Above the WGS84 ellipsoid, same convention as SiteHome.altitudeM. */
  altitudeM: number;
  pattern: DevicePattern;
  /** Lobe radius in meters - the coverage distance for "omni"/"dipole", or the sector's reach
   *  for "directional". */
  rangeM: number;
  /** Compass bearing (0 = north, clockwise) the lobe's main axis/sector faces. Stored (and
   *  editable) even for "omni", where it has no visible effect, so switching pattern later
   *  doesn't lose a previously-set facing. */
  bearingDeg: number;
  /** Full angular width of the "directional" sector, in degrees. Unused for "omni"/"dipole". */
  beamwidthDeg: number;
  /** Which built-in/custom preset this device's pattern/range/beamwidth were last set from -
   *  cleared to null the moment the user edits any of those fields by hand, so the property
   *  panel can show whether a device is still "on preset" or has been custom-tuned. */
  presetId: string | null;
}

/** One saved ground-station layout for a physical flying location. */
export interface Site {
  id: string;
  name: string;
  home: SiteHome | null;
  devices: SiteDevice[];
}
