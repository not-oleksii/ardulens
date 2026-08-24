import piexif from "piexifjs";
import type { CamGeoTag } from "./geotag";

// piexifjs works on JPEG bytes represented as a "binary string" (one char code per byte, the
// classic latin1/binary-string convention its own README's Node example round-trips through
// Buffer.from(str, "binary")) - not Uint8Array. Chunked to avoid blowing the call-stack limit
// String.fromCharCode(...bytes) hits on a full-size photo (multi-megabyte JPEGs are normal
// here, easily millions of spread arguments).
const CHUNK_SIZE = 8192;

export function uint8ArrayToBinaryString(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    result += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return result;
}

export function binaryStringToUint8Array(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

export interface GeoTagOptions {
  /** Mirrors Mission Planner's own "Use AMSL Alt" checkbox - true writes CAM.Alt (AMSL),
   *  false writes CAM.RelAlt (home-relative) into the EXIF GPSAltitude tag. */
  useAmslAltitude: boolean;
}

/** Injects real GPS EXIF tags into one JPEG's bytes, from one CAM-record-derived geotag -
 *  preserves every other existing EXIF tag (camera make/model, capture timestamp, etc.), only
 *  adding/overwriting the GPS IFD. Fields written: GPSLatitude/Ref, GPSLongitude/Ref,
 *  GPSAltitude/Ref (a plain unsigned rational in meters, not the DMS format the lat/lng use -
 *  confirmed against the EXIF 2.3 spec's own GPS IFD tag definitions), and GPSImgDirection/Ref
 *  from the CAM record's own yaw - the one standard EXIF GPS field for "the direction the
 *  camera was pointing." Roll/pitch have no standard EXIF equivalent (would need a
 *  proprietary/XMP field), so aren't written - a deliberate v1 scope cut, not an oversight. */
export function geotagJpegBytes(original: Uint8Array, tag: CamGeoTag, options: GeoTagOptions): Uint8Array {
  const jpegBinaryString = uint8ArrayToBinaryString(original);
  const altitudeMeters = options.useAmslAltitude ? tag.altMsl : tag.altRel;
  const yawNormalized = ((tag.yawDeg % 360) + 360) % 360;

  let exifDict: piexif.ExifDict;
  try {
    exifDict = piexif.load(jpegBinaryString);
  } catch {
    // A photo with no pre-existing EXIF segment at all (rare, but real cameras/exports can
    // omit one) - start from an empty dict rather than failing the whole geotag operation.
    exifDict = {};
  }

  exifDict.GPS = {
    [piexif.GPSIFD.GPSVersionID]: [2, 3, 0, 0],
    [piexif.GPSIFD.GPSLatitudeRef]: tag.lat < 0 ? "S" : "N",
    [piexif.GPSIFD.GPSLatitude]: piexif.GPSHelper.degToDmsRational(tag.lat),
    [piexif.GPSIFD.GPSLongitudeRef]: tag.lng < 0 ? "W" : "E",
    [piexif.GPSIFD.GPSLongitude]: piexif.GPSHelper.degToDmsRational(tag.lng),
    [piexif.GPSIFD.GPSAltitudeRef]: altitudeMeters < 0 ? 1 : 0,
    [piexif.GPSIFD.GPSAltitude]: [Math.round(Math.abs(altitudeMeters) * 100), 100],
    [piexif.GPSIFD.GPSImgDirectionRef]: "T",
    [piexif.GPSIFD.GPSImgDirection]: [Math.round(yawNormalized * 100), 100],
  };

  const exifBytes = piexif.dump(exifDict);
  const insertedBinaryString = piexif.insert(exifBytes, jpegBinaryString);
  return binaryStringToUint8Array(insertedBinaryString);
}
