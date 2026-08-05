/**
 * A TypeScript port of ArduPilot's AP_GeodesicGrid (libraries/AP_Math/AP_GeodesicGrid.h),
 * the 80-section icosahedron subdivision that MAG_CAL_PROGRESS's `completion_mask` bitmask
 * refers to. This module only needs the *geometry* (each section's 3D vertices, in the exact
 * same order/indexing ArduPilot uses) so a coverage sphere can render bit i of the mask as the
 * right patch - it does not need AP_GeodesicGrid::section() itself, since the vehicle already
 * tells us which section a sample landed in via the mask.
 *
 * Geometry, verbatim from the header's doc comment: the icosahedron is tessellated by a
 * factor of 2 (each of its 20 faces split into 4 sub-triangles by bisecting its edges and
 * projecting the new points onto the circumscribed sphere), giving 80 "sections". Section
 * index s = 4*i + j, where i in [0,20) is the icosahedron triangle and j in [0,4) is which
 * sub-triangle of it. The 20 triangles are 10 explicit ones (T_0..T_9, golden-ratio vertices)
 * followed by their antipodal reflections (T_(i+10) = -T_i).
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type GeodesicTriangle = readonly [Vec3, Vec3, Vec3];

const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function negate(v: Vec3): Vec3 {
  return vec3(-v.x, -v.y, -v.z);
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return vec3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

function normalize(v: Vec3): Vec3 {
  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return vec3(v.x / length, v.y / length, v.z / length);
}

// T_0..T_9, quoted directly from AP_GeodesicGrid.h's class doc comment (g = golden ratio).
const g = GOLDEN_RATIO;
const BASE_TRIANGLES: readonly GeodesicTriangle[] = [
  [vec3(-g, 1, 0), vec3(-1, 0, -g), vec3(-g, -1, 0)],
  [vec3(-1, 0, -g), vec3(-g, -1, 0), vec3(0, -g, -1)],
  [vec3(-g, -1, 0), vec3(0, -g, -1), vec3(0, -g, 1)],
  [vec3(-1, 0, -g), vec3(0, -g, -1), vec3(1, 0, -g)],
  [vec3(0, -g, -1), vec3(0, -g, 1), vec3(g, -1, 0)],
  [vec3(0, -g, -1), vec3(1, 0, -g), vec3(g, -1, 0)],
  [vec3(g, -1, 0), vec3(1, 0, -g), vec3(g, 1, 0)],
  [vec3(1, 0, -g), vec3(g, 1, 0), vec3(0, g, -1)],
  [vec3(1, 0, -g), vec3(0, g, -1), vec3(-1, 0, -g)],
  [vec3(0, g, -1), vec3(-g, 1, 0), vec3(-1, 0, -g)],
];

// T_(i+10) = -T_i for i in [0,10) - the icosahedron's antipodal triangles.
const ICOSAHEDRON_TRIANGLES: readonly GeodesicTriangle[] = [
  ...BASE_TRIANGLES,
  ...BASE_TRIANGLES.map(([a, b, c]): GeodesicTriangle => [negate(a), negate(b), negate(c)]),
].map(([a, b, c]): GeodesicTriangle => [normalize(a), normalize(b), normalize(c)]);

/**
 * Splits an icosahedron triangle T=(a,b,c) into its 4 sub-triangles, per the header's doc:
 * middle triangle M=(m_a,m_b,m_c) where m_a/m_b/m_c bisect (a,b)/(b,c)/(c,a), each projected
 * back onto the unit sphere; W_0=M, W_1=(a,m_a,m_c), W_2=(m_a,b,m_b), W_3=(m_c,m_b,c).
 */
function subTriangles([a, b, c]: GeodesicTriangle): GeodesicTriangle[] {
  const mA = normalize(midpoint(a, b));
  const mB = normalize(midpoint(b, c));
  const mC = normalize(midpoint(c, a));
  return [
    [mA, mB, mC],
    [a, mA, mC],
    [mA, b, mB],
    [mC, mB, c],
  ];
}

/**
 * The 80 geodesic sections, in the same order as ArduPilot's section index s = 4*i + j - so
 * bit i of MAG_CAL_PROGRESS's completion_mask maps directly to GEODESIC_SECTIONS[i].
 */
export const GEODESIC_SECTIONS: readonly GeodesicTriangle[] = ICOSAHEDRON_TRIANGLES.flatMap(subTriangles);

export function isCompletionMaskSectionSet(completionMask: readonly number[], section: number): boolean {
  const byte = completionMask[section >> 3] ?? 0;
  return (byte & (1 << (section & 7))) !== 0;
}
