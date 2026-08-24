import piexif from "piexifjs";
import { describe, expect, it } from "vitest";
import type { CamGeoTag } from "../geotag";
import { binaryStringToUint8Array, geotagJpegBytes, uint8ArrayToBinaryString } from "../geotagExif";

// The smallest byte sequence piexifjs's own segment parser (splitIntoSegments) accepts as
// "JPEG": SOI, then a Start-Of-Scan marker immediately (no DQT/SOF/DHT needed - the parser
// only walks marker segments up to SOS, then treats everything from there to the end as one
// opaque final segment), then a couple of placeholder scan bytes, then EOI. Not a real
// decodable image, but real enough to exercise piexif.load/insert's actual parsing logic
// rather than a mocked one.
const MINIMAL_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x00, 0xff, 0xd9]);

function tag(overrides: Partial<CamGeoTag> = {}): CamGeoTag {
  return {
    index: 0,
    timeUs: 0,
    lat: 50.4501,
    lng: 30.5234,
    altMsl: 123.45,
    altRel: 45.6,
    rollDeg: 1.2,
    pitchDeg: -3.4,
    yawDeg: 190.5,
    ...overrides,
  };
}

describe("uint8ArrayToBinaryString / binaryStringToUint8Array", () => {
  it("round-trips arbitrary bytes, including a chunk-boundary-crossing size", () => {
    const bytes = new Uint8Array(20000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const roundTripped = binaryStringToUint8Array(uint8ArrayToBinaryString(bytes));
    expect(roundTripped).toEqual(bytes);
  });
});

describe("geotagJpegBytes", () => {
  it("writes real, readable GPS EXIF tags matching the given geotag (AMSL altitude)", () => {
    const result = geotagJpegBytes(MINIMAL_JPEG, tag(), { useAmslAltitude: true });
    const exif = piexif.load(uint8ArrayToBinaryString(result));

    expect(exif.GPS![piexif.GPSIFD.GPSLatitudeRef]).toBe("N");
    const lat = exif.GPS![piexif.GPSIFD.GPSLatitude] as number[];
    expect(piexif.GPSHelper.dmsRationalToDeg(lat, "N")).toBeCloseTo(50.4501, 4);
    expect(exif.GPS![piexif.GPSIFD.GPSLongitudeRef]).toBe("E");
    const lng = exif.GPS![piexif.GPSIFD.GPSLongitude] as number[];
    expect(piexif.GPSHelper.dmsRationalToDeg(lng, "E")).toBeCloseTo(30.5234, 4);
    expect(exif.GPS![piexif.GPSIFD.GPSAltitudeRef]).toBe(0);
    const [altNum, altDen] = exif.GPS![piexif.GPSIFD.GPSAltitude] as [number, number];
    expect(altNum / altDen).toBeCloseTo(123.45, 1);
  });

  it("writes the relative altitude instead when useAmslAltitude is false", () => {
    const result = geotagJpegBytes(MINIMAL_JPEG, tag(), { useAmslAltitude: false });
    const exif = piexif.load(uint8ArrayToBinaryString(result));
    const [altNum, altDen] = exif.GPS![piexif.GPSIFD.GPSAltitude] as [number, number];
    expect(altNum / altDen).toBeCloseTo(45.6, 1);
  });

  it("uses S/W refs and GPSAltitudeRef=1 for negative lat/lng/altitude", () => {
    const result = geotagJpegBytes(MINIMAL_JPEG, tag({ lat: -12.3, lng: -45.6, altMsl: -5 }), {
      useAmslAltitude: true,
    });
    const exif = piexif.load(uint8ArrayToBinaryString(result));
    expect(exif.GPS![piexif.GPSIFD.GPSLatitudeRef]).toBe("S");
    expect(exif.GPS![piexif.GPSIFD.GPSLongitudeRef]).toBe("W");
    expect(exif.GPS![piexif.GPSIFD.GPSAltitudeRef]).toBe(1);
  });

  it("writes GPSImgDirection from yaw, normalized into 0-360", () => {
    const result = geotagJpegBytes(MINIMAL_JPEG, tag({ yawDeg: 190.5 }), { useAmslAltitude: true });
    const exif = piexif.load(uint8ArrayToBinaryString(result));
    const [dirNum, dirDen] = exif.GPS![piexif.GPSIFD.GPSImgDirection] as [number, number];
    expect(dirNum / dirDen).toBeCloseTo(190.5, 1);
  });

  it("does not disturb the JPEG's SOI/EOI framing", () => {
    const result = geotagJpegBytes(MINIMAL_JPEG, tag(), { useAmslAltitude: true });
    expect(result[0]).toBe(0xff);
    expect(result[1]).toBe(0xd8);
    expect(result[result.length - 2]).toBe(0xff);
    expect(result[result.length - 1]).toBe(0xd9);
  });
});
