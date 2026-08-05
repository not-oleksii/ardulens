import { GEODESIC_SECTIONS, isCompletionMaskSectionSet, type Vec3 } from "../../mavlink/geodesicGrid/geodesicGrid";

export type ScreenPoint = readonly [number, number];
export type ScreenTriangle = readonly [ScreenPoint, ScreenPoint, ScreenPoint];

export interface ProjectedSection {
  section: number;
  points: ScreenTriangle;
  covered: boolean;
  /** Average rotated Z of the triangle's 3 vertices - larger is closer to the viewer. Exposed
   *  mainly so callers/tests can confirm the back-to-front draw order, not needed to render. */
  depth: number;
}

/** Rotates v around the Y axis (yaw/azimuth), then around the resulting X axis (pitch/elevation). */
function rotate(v: Vec3, azimuthRad: number, elevationRad: number): Vec3 {
  const cosA = Math.cos(azimuthRad);
  const sinA = Math.sin(azimuthRad);
  const x1 = v.x * cosA + v.z * sinA;
  const z1 = -v.x * sinA + v.z * cosA;
  const y1 = v.y;

  const cosE = Math.cos(elevationRad);
  const sinE = Math.sin(elevationRad);
  const y2 = y1 * cosE - z1 * sinE;
  const z2 = y1 * sinE + z1 * cosE;

  return { x: x1, y: y2, z: z2 };
}

/**
 * Projects the 80 geodesic sections onto a 2D disc of the given radius (orthographic
 * projection, camera looking along -Z toward the origin), rotated by azimuth/elevation
 * (degrees) so the user can spin the sphere to inspect coverage on every side.
 *
 * Sections are returned back-to-front (ascending rotated Z) so a caller can draw them in
 * that order and get correct occlusion via the painter's algorithm - valid here because the
 * sphere is convex, so at any screen point the frontmost triangle always has the largest Z.
 */
export function projectCoverageSphere(
  completionMask: readonly number[],
  azimuthDeg: number,
  elevationDeg: number,
  radius: number,
): ProjectedSection[] {
  const azimuthRad = (azimuthDeg * Math.PI) / 180;
  const elevationRad = (elevationDeg * Math.PI) / 180;

  return GEODESIC_SECTIONS.map((triangle, section) => {
    const rotated = triangle.map((v) => rotate(v, azimuthRad, elevationRad));
    const points = rotated.map(({ x, y }): ScreenPoint => [x * radius, -y * radius]) as unknown as ScreenTriangle;
    const depth = (rotated[0]!.z + rotated[1]!.z + rotated[2]!.z) / 3;
    return { section, points, covered: isCompletionMaskSectionSet(completionMask, section), depth };
  }).sort((a, b) => a.depth - b.depth);
}
