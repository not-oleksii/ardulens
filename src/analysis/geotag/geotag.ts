import { parseDataflash } from "../../parsers/dataflash-bin/dataflash-bin";

export interface CamGeoTag {
  /** 0-based order this CAM record appears in the log - matched 1:1, in order, against
   *  photo filenames sorted the same way, exactly Mission Planner's own "CAM Message mode"
   *  matching convention (see ardupilot.org's GeoTag docs). */
  index: number;
  timeUs: number;
  lat: number;
  lng: number;
  /** AMSL, from CAM.Alt - ArduPilot's fused/EKF altitude estimate at the trigger moment,
   *  distinct from the separate, noisier CAM.GPSAlt raw-GPS field (not used here) and from
   *  CAM.RelAlt below. */
  altMsl: number;
  /** Home-relative altitude, from CAM.RelAlt. */
  altRel: number;
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number;
}

/** Extracts one entry per camera-trigger event logged by ArduPilot's own CAM dataflash
 *  message - real field names (TimeUS/Lat/Lng/Alt/RelAlt/GPSAlt/R/P/Y) confirmed against
 *  ardupilot.org's own Onboard Message Log Messages reference. This is the exact data
 *  source Mission Planner's GeoTag tool's "CAM Message mode" uses - no clock-sync guessing
 *  between camera and autopilot needed, unlike its alternate Time Offset mode (not built
 *  here - see GeoTagView's own scope note).
 *
 *  Records are returned in raw log order, unfiltered - a photo/CAM count mismatch is a
 *  real signal (see MATCHING below) that a filtered array would silently hide. */
export function extractCamGeoTags(buf: ArrayBuffer): CamGeoTag[] {
  const { tables } = parseDataflash(buf);
  const CAM = tables["CAM"] ?? [];
  return CAM.map((rec, index) => ({
    index,
    timeUs: rec["TimeUS"] as number,
    lat: rec["Lat"] as number,
    lng: rec["Lng"] as number,
    altMsl: rec["Alt"] as number,
    altRel: rec["RelAlt"] as number,
    rollDeg: rec["R"] as number,
    pitchDeg: rec["P"] as number,
    yawDeg: rec["Y"] as number,
  }));
}
