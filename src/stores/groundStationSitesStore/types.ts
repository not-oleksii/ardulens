/** A saved ground-station site's home position - null until the user actually places one on
 *  the map. `altitudeM` is above the WGS84 ellipsoid (matching how LiveMapSection/CesiumMapView
 *  already sample terrain height), auto-filled from the terrain at the clicked point but
 *  editable, same convention as this app's other "auto-sample, allow manual override" fields. */
export interface SiteHome {
  lat: number;
  lon: number;
  altitudeM: number;
}

/** One saved ground-station layout for a physical flying location - beacons/antennas land here
 *  in a later phase (see the Ground Station epic's own plan). */
export interface Site {
  id: string;
  name: string;
  home: SiteHome | null;
}
