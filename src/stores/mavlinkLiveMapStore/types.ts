export interface FlyToTarget {
  lat: number;
  lon: number;
  altitudeM: number;
}

export interface HomeTarget {
  lat: number;
  lon: number;
}

export interface MavlinkLiveMapState {
  /** The last "Fly to here"/"Set home here" targets - survive LiveMapSection unmounting (e.g.
   *  switching to a different ArduPilot Setup sidebar section and back), so its Cesium markers
   *  and track line restore instead of silently vanishing on remount. Cleared on disconnect. */
  flyToTarget: FlyToTarget | null;
  homeTarget: HomeTarget | null;
  /** Whether the initial camera fly-to-vehicle animation has already happened once this
   *  connection - a remount (see above) skips repeating that animation (which reads as the
   *  view "resetting") and instead snaps the camera straight to the vehicle's current position. */
  hasFlownOnce: boolean;
  setFlyToTarget: (target: FlyToTarget) => void;
  setHomeTarget: (target: HomeTarget) => void;
  setHasFlownOnce: () => void;
  reset: () => void;
}
