/**
 * Motor position/rotation data for ArduCopter's frame classes, so a live motor test can show
 * the user where each numbered motor *should* be and which way it should spin - not guessed,
 * extracted programmatically from the exact coordinates and CW/CCW markers in ArduPilot's own
 * official motor diagram SVGs (https://ardupilot.org/copter/docs/connect-escs-and-motors.html,
 * e.g. m_01_01_quad_x.svg), then converted to angles. Every diagram's angles were sanity-
 * checked against expected clean values (evenly-spaced multiples of 360/motorCount, or the
 * true vertex angles for uneven layouts) before being included here.
 *
 * ArduPilot does not support remapping which physical output drives which frame position for
 * these standard classes - the wiring is fixed by convention. This data is for *display and
 * verification* (does the motor that spins when "Motor 1" is tested actually sit where the
 * diagram says it should, spinning the right way?), not for reassigning outputs in software.
 *
 * Deliberately excluded: Tricopter and Bicopter (ArduPilot's own diagrams mark their motors
 * "NYT" - no required rotation direction, since yaw comes from a tilting servo, not a CW/CCW
 * differential) and Quad V-Tail/A-Tail (only 2 of their 4 motors have a defined direction in
 * the source diagram, the other 2 are tilting-servo motors marked NYT - a half-populated
 * diagram would be misleading). Heli/HeliQuad/Heli_Dual/CoaxCopter/SingleCopter and the
 * Scripting Matrix classes have no fixed multi-motor CW/CCW geometry to diagram at all.
 */

export interface MotorPosition {
  /** ArduPilot's 1-indexed motor/output number, matching DO_MOTOR_TEST's `instance` param. */
  motor: number;
  /** Degrees clockwise from front (0 = straight ahead), matching the real diagrams' layout. */
  angleDeg: number;
  direction: "CW" | "CCW";
}

// FRAME_CLASS 1 (Quad). FRAME_TYPE codes from ArduCopter's own apm.pdef.xml.
const QUAD_PLUS: MotorPosition[] = [
  { motor: 1, angleDeg: 90, direction: "CCW" },
  { motor: 2, angleDeg: 270, direction: "CCW" },
  { motor: 3, angleDeg: 0, direction: "CW" },
  { motor: 4, angleDeg: 180, direction: "CW" },
];

const QUAD_X: MotorPosition[] = [
  { motor: 1, angleDeg: 45, direction: "CCW" },
  { motor: 2, angleDeg: 225, direction: "CCW" },
  { motor: 3, angleDeg: 315, direction: "CW" },
  { motor: 4, angleDeg: 135, direction: "CW" },
];

const QUAD_V: MotorPosition[] = [
  { motor: 1, angleDeg: 47.73, direction: "CCW" },
  { motor: 2, angleDeg: 214.99, direction: "CCW" },
  { motor: 3, angleDeg: 312.27, direction: "CW" },
  { motor: 4, angleDeg: 145.01, direction: "CW" },
];

const QUAD_H: MotorPosition[] = [
  { motor: 1, angleDeg: 45.0, direction: "CW" },
  { motor: 2, angleDeg: 225.0, direction: "CW" },
  { motor: 3, angleDeg: 315.0, direction: "CCW" },
  { motor: 4, angleDeg: 135.0, direction: "CCW" },
];

const QUAD_X_BETAFLIGHT: MotorPosition[] = [
  { motor: 1, angleDeg: 135.0, direction: "CW" },
  { motor: 2, angleDeg: 45.0, direction: "CCW" },
  { motor: 3, angleDeg: 225.0, direction: "CCW" },
  { motor: 4, angleDeg: 315.0, direction: "CW" },
];

const QUAD_X_DJI: MotorPosition[] = [
  { motor: 1, angleDeg: 45.0, direction: "CCW" },
  { motor: 2, angleDeg: 315.0, direction: "CW" },
  { motor: 3, angleDeg: 225.0, direction: "CCW" },
  { motor: 4, angleDeg: 135.0, direction: "CW" },
];

const QUAD_X_CLOCKWISE: MotorPosition[] = [
  { motor: 1, angleDeg: 45.0, direction: "CCW" },
  { motor: 2, angleDeg: 135.0, direction: "CW" },
  { motor: 3, angleDeg: 225.0, direction: "CCW" },
  { motor: 4, angleDeg: 315.0, direction: "CW" },
];

const QUAD_X_BETAFLIGHT_REV: MotorPosition[] = [
  { motor: 1, angleDeg: 135.0, direction: "CCW" },
  { motor: 2, angleDeg: 45.0, direction: "CW" },
  { motor: 3, angleDeg: 225.0, direction: "CW" },
  { motor: 4, angleDeg: 315.0, direction: "CCW" },
];

const QUAD_Y4: MotorPosition[] = [
  { motor: 1, angleDeg: 59.41, direction: "CCW" },
  { motor: 2, angleDeg: 180.0, direction: "CW" },
  { motor: 3, angleDeg: 180.0, direction: "CCW" },
  { motor: 4, angleDeg: 300.59, direction: "CW" },
];

// FRAME_CLASS 2 (Hexa).
const HEXA_PLUS: MotorPosition[] = [
  { motor: 1, angleDeg: 0, direction: "CW" },
  { motor: 2, angleDeg: 180, direction: "CCW" },
  { motor: 3, angleDeg: 243.43, direction: "CW" },
  { motor: 4, angleDeg: 63.43, direction: "CCW" },
  { motor: 5, angleDeg: 296.57, direction: "CCW" },
  { motor: 6, angleDeg: 116.57, direction: "CW" },
];

const HEXA_X: MotorPosition[] = [
  { motor: 1, angleDeg: 90, direction: "CW" },
  { motor: 2, angleDeg: 270, direction: "CCW" },
  { motor: 3, angleDeg: 333.43, direction: "CW" },
  { motor: 4, angleDeg: 153.43, direction: "CCW" },
  { motor: 5, angleDeg: 26.57, direction: "CCW" },
  { motor: 6, angleDeg: 206.57, direction: "CW" },
];

const HEXA_H: MotorPosition[] = [
  { motor: 1, angleDeg: 90.0, direction: "CW" },
  { motor: 2, angleDeg: 270.0, direction: "CCW" },
  { motor: 3, angleDeg: 315.0, direction: "CW" },
  { motor: 4, angleDeg: 135.0, direction: "CCW" },
  { motor: 5, angleDeg: 45.0, direction: "CCW" },
  { motor: 6, angleDeg: 225.0, direction: "CW" },
];

const HEXA_X_DJI: MotorPosition[] = [
  { motor: 1, angleDeg: 26.57, direction: "CCW" },
  { motor: 2, angleDeg: 333.43, direction: "CW" },
  { motor: 3, angleDeg: 270.0, direction: "CCW" },
  { motor: 4, angleDeg: 206.57, direction: "CW" },
  { motor: 5, angleDeg: 153.43, direction: "CCW" },
  { motor: 6, angleDeg: 90.0, direction: "CW" },
];

const HEXA_X_CLOCKWISE: MotorPosition[] = [
  { motor: 1, angleDeg: 26.57, direction: "CCW" },
  { motor: 2, angleDeg: 90.0, direction: "CW" },
  { motor: 3, angleDeg: 153.43, direction: "CCW" },
  { motor: 4, angleDeg: 206.57, direction: "CW" },
  { motor: 5, angleDeg: 270.0, direction: "CCW" },
  { motor: 6, angleDeg: 333.43, direction: "CW" },
];

// FRAME_CLASS 3 (Octo).
const OCTA_PLUS: MotorPosition[] = [
  { motor: 1, angleDeg: 0, direction: "CW" },
  { motor: 2, angleDeg: 180, direction: "CW" },
  { motor: 3, angleDeg: 45, direction: "CCW" },
  { motor: 4, angleDeg: 135, direction: "CCW" },
  { motor: 5, angleDeg: 315, direction: "CCW" },
  { motor: 6, angleDeg: 225, direction: "CCW" },
  { motor: 7, angleDeg: 270, direction: "CW" },
  { motor: 8, angleDeg: 90, direction: "CW" },
];

const OCTA_X: MotorPosition[] = [
  { motor: 1, angleDeg: 22.5, direction: "CW" },
  { motor: 2, angleDeg: 202.5, direction: "CW" },
  { motor: 3, angleDeg: 67.5, direction: "CCW" },
  { motor: 4, angleDeg: 157.5, direction: "CCW" },
  { motor: 5, angleDeg: 337.5, direction: "CCW" },
  { motor: 6, angleDeg: 247.5, direction: "CCW" },
  { motor: 7, angleDeg: 292.5, direction: "CW" },
  { motor: 8, angleDeg: 112.5, direction: "CW" },
];

const OCTA_V: MotorPosition[] = [
  { motor: 1, angleDeg: 292.28, direction: "CW" },
  { motor: 2, angleDeg: 115.53, direction: "CW" },
  { motor: 3, angleDeg: 244.47, direction: "CCW" },
  { motor: 4, angleDeg: 153.43, direction: "CCW" },
  { motor: 5, angleDeg: 315.0, direction: "CCW" },
  { motor: 6, angleDeg: 67.72, direction: "CCW" },
  { motor: 7, angleDeg: 45.0, direction: "CW" },
  { motor: 8, angleDeg: 206.57, direction: "CW" },
];

const OCTA_H: MotorPosition[] = [
  { motor: 1, angleDeg: 45.0, direction: "CW" },
  { motor: 2, angleDeg: 225.0, direction: "CW" },
  { motor: 3, angleDeg: 71.58, direction: "CCW" },
  { motor: 4, angleDeg: 135.0, direction: "CCW" },
  { motor: 5, angleDeg: 315.0, direction: "CCW" },
  { motor: 6, angleDeg: 251.58, direction: "CCW" },
  { motor: 7, angleDeg: 288.42, direction: "CW" },
  { motor: 8, angleDeg: 108.42, direction: "CW" },
];

const OCTA_X_DJI: MotorPosition[] = [
  { motor: 1, angleDeg: 22.5, direction: "CCW" },
  { motor: 2, angleDeg: 337.5, direction: "CW" },
  { motor: 3, angleDeg: 292.5, direction: "CCW" },
  { motor: 4, angleDeg: 247.5, direction: "CW" },
  { motor: 5, angleDeg: 202.5, direction: "CCW" },
  { motor: 6, angleDeg: 157.5, direction: "CW" },
  { motor: 7, angleDeg: 112.5, direction: "CCW" },
  { motor: 8, angleDeg: 67.5, direction: "CW" },
];

const OCTA_X_CLOCKWISE: MotorPosition[] = [
  { motor: 1, angleDeg: 22.5, direction: "CCW" },
  { motor: 2, angleDeg: 67.5, direction: "CW" },
  { motor: 3, angleDeg: 112.5, direction: "CCW" },
  { motor: 4, angleDeg: 157.5, direction: "CW" },
  { motor: 5, angleDeg: 202.5, direction: "CCW" },
  { motor: 6, angleDeg: 247.5, direction: "CW" },
  { motor: 7, angleDeg: 292.5, direction: "CCW" },
  { motor: 8, angleDeg: 337.5, direction: "CW" },
];

const OCTA_I: MotorPosition[] = [
  { motor: 1, angleDeg: 198.42, direction: "CW" },
  { motor: 2, angleDeg: 18.42, direction: "CW" },
  { motor: 3, angleDeg: 225.0, direction: "CCW" },
  { motor: 4, angleDeg: 341.58, direction: "CCW" },
  { motor: 5, angleDeg: 161.58, direction: "CCW" },
  { motor: 6, angleDeg: 45.0, direction: "CCW" },
  { motor: 7, angleDeg: 135.0, direction: "CW" },
  { motor: 8, angleDeg: 315.0, direction: "CW" },
];

// FRAME_CLASS 4 (OctaQuad) - a Quad frame with 2 coaxial (stacked) motors per arm, 8 total.
const OCTAQUAD_PLUS: MotorPosition[] = [
  { motor: 1, angleDeg: 0.0, direction: "CCW" },
  { motor: 2, angleDeg: 270.0, direction: "CW" },
  { motor: 3, angleDeg: 180.0, direction: "CCW" },
  { motor: 4, angleDeg: 90.0, direction: "CW" },
  { motor: 5, angleDeg: 270.0, direction: "CCW" },
  { motor: 6, angleDeg: 0.0, direction: "CW" },
  { motor: 7, angleDeg: 90.0, direction: "CCW" },
  { motor: 8, angleDeg: 180.0, direction: "CW" },
];

const OCTAQUAD_X: MotorPosition[] = [
  { motor: 1, angleDeg: 45.0, direction: "CCW" },
  { motor: 2, angleDeg: 315.0, direction: "CW" },
  { motor: 3, angleDeg: 225.0, direction: "CCW" },
  { motor: 4, angleDeg: 135.0, direction: "CW" },
  { motor: 5, angleDeg: 315.0, direction: "CCW" },
  { motor: 6, angleDeg: 45.0, direction: "CW" },
  { motor: 7, angleDeg: 135.0, direction: "CCW" },
  { motor: 8, angleDeg: 225.0, direction: "CW" },
];

const OCTAQUAD_V: MotorPosition[] = [
  { motor: 1, angleDeg: 45.0, direction: "CCW" },
  { motor: 2, angleDeg: 315.0, direction: "CW" },
  { motor: 3, angleDeg: 214.99, direction: "CCW" },
  { motor: 4, angleDeg: 145.01, direction: "CW" },
  { motor: 5, angleDeg: 315.0, direction: "CCW" },
  { motor: 6, angleDeg: 45.0, direction: "CW" },
  { motor: 7, angleDeg: 145.01, direction: "CCW" },
  { motor: 8, angleDeg: 214.99, direction: "CW" },
];

const OCTAQUAD_H: MotorPosition[] = [
  { motor: 1, angleDeg: 45.0, direction: "CW" },
  { motor: 2, angleDeg: 315.0, direction: "CCW" },
  { motor: 3, angleDeg: 225.0, direction: "CW" },
  { motor: 4, angleDeg: 135.0, direction: "CCW" },
  { motor: 5, angleDeg: 315.0, direction: "CW" },
  { motor: 6, angleDeg: 45.0, direction: "CCW" },
  { motor: 7, angleDeg: 135.0, direction: "CW" },
  { motor: 8, angleDeg: 225.0, direction: "CCW" },
];

const OCTAQUAD_X_BETAFLIGHT: MotorPosition[] = [
  { motor: 1, angleDeg: 135.0, direction: "CW" },
  { motor: 2, angleDeg: 45.0, direction: "CCW" },
  { motor: 3, angleDeg: 225.0, direction: "CCW" },
  { motor: 4, angleDeg: 315.0, direction: "CW" },
  { motor: 5, angleDeg: 135.0, direction: "CCW" },
  { motor: 6, angleDeg: 45.0, direction: "CW" },
  { motor: 7, angleDeg: 225.0, direction: "CW" },
  { motor: 8, angleDeg: 315.0, direction: "CCW" },
];

const OCTAQUAD_X_CLOCKWISE: MotorPosition[] = [
  { motor: 1, angleDeg: 45.0, direction: "CCW" },
  { motor: 2, angleDeg: 45.0, direction: "CW" },
  { motor: 3, angleDeg: 135.0, direction: "CW" },
  { motor: 4, angleDeg: 135.0, direction: "CCW" },
  { motor: 5, angleDeg: 225.0, direction: "CCW" },
  { motor: 6, angleDeg: 225.0, direction: "CW" },
  { motor: 7, angleDeg: 315.0, direction: "CW" },
  { motor: 8, angleDeg: 315.0, direction: "CCW" },
];

const OCTAQUAD_X_BETAFLIGHT_REV: MotorPosition[] = [
  { motor: 1, angleDeg: 135.0, direction: "CCW" },
  { motor: 2, angleDeg: 45.0, direction: "CW" },
  { motor: 3, angleDeg: 225.0, direction: "CW" },
  { motor: 4, angleDeg: 315.0, direction: "CCW" },
  { motor: 5, angleDeg: 135.0, direction: "CW" },
  { motor: 6, angleDeg: 45.0, direction: "CCW" },
  { motor: 7, angleDeg: 225.0, direction: "CCW" },
  { motor: 8, angleDeg: 315.0, direction: "CW" },
];

// FRAME_CLASS 5 (Y6) - 3 arms, 2 coaxial motors per arm, 6 total. FRAME_TYPE 0 = "A" (no
// distinct enum name - it's the default/first Y6 layout in ArduPilot's own diagrams).
const Y6_A: MotorPosition[] = [
  { motor: 1, angleDeg: 63.45, direction: "CCW" },
  { motor: 2, angleDeg: 296.55, direction: "CW" },
  { motor: 3, angleDeg: 296.55, direction: "CCW" },
  { motor: 4, angleDeg: 180.0, direction: "CW" },
  { motor: 5, angleDeg: 63.45, direction: "CW" },
  { motor: 6, angleDeg: 180.0, direction: "CCW" },
];

const Y6_B: MotorPosition[] = [
  { motor: 1, angleDeg: 63.43, direction: "CW" },
  { motor: 2, angleDeg: 63.43, direction: "CCW" },
  { motor: 3, angleDeg: 180.0, direction: "CW" },
  { motor: 4, angleDeg: 180.0, direction: "CCW" },
  { motor: 5, angleDeg: 296.57, direction: "CW" },
  { motor: 6, angleDeg: 296.57, direction: "CCW" },
];

const Y6_F: MotorPosition[] = [
  { motor: 1, angleDeg: 180.0, direction: "CCW" },
  { motor: 2, angleDeg: 63.43, direction: "CCW" },
  { motor: 3, angleDeg: 296.57, direction: "CCW" },
  { motor: 4, angleDeg: 180.0, direction: "CW" },
  { motor: 5, angleDeg: 63.43, direction: "CW" },
  { motor: 6, angleDeg: 296.57, direction: "CW" },
];

// FRAME_CLASS 12 (DodecaHexa) - a Hexa frame with 2 coaxial motors per arm, 12 total.
const DODECAHEXA_PLUS: MotorPosition[] = [
  { motor: 1, angleDeg: 0.0, direction: "CCW" },
  { motor: 2, angleDeg: 0.0, direction: "CW" },
  { motor: 3, angleDeg: 63.43, direction: "CW" },
  { motor: 4, angleDeg: 63.43, direction: "CCW" },
  { motor: 5, angleDeg: 116.57, direction: "CCW" },
  { motor: 6, angleDeg: 116.57, direction: "CW" },
  { motor: 7, angleDeg: 180.0, direction: "CW" },
  { motor: 8, angleDeg: 180.0, direction: "CCW" },
  { motor: 9, angleDeg: 243.43, direction: "CCW" },
  { motor: 10, angleDeg: 243.43, direction: "CW" },
  { motor: 11, angleDeg: 296.57, direction: "CW" },
  { motor: 12, angleDeg: 296.57, direction: "CCW" },
];

const DODECAHEXA_X: MotorPosition[] = [
  { motor: 1, angleDeg: 26.57, direction: "CCW" },
  { motor: 2, angleDeg: 26.57, direction: "CW" },
  { motor: 3, angleDeg: 90.0, direction: "CW" },
  { motor: 4, angleDeg: 90.0, direction: "CCW" },
  { motor: 5, angleDeg: 153.43, direction: "CCW" },
  { motor: 6, angleDeg: 153.43, direction: "CW" },
  { motor: 7, angleDeg: 206.57, direction: "CW" },
  { motor: 8, angleDeg: 206.57, direction: "CCW" },
  { motor: 9, angleDeg: 270.0, direction: "CCW" },
  { motor: 10, angleDeg: 270.0, direction: "CW" },
  { motor: 11, angleDeg: 333.43, direction: "CW" },
  { motor: 12, angleDeg: 333.43, direction: "CCW" },
];

// FRAME_CLASS 14 (Deca) - 10 independent (non-coaxial) arms.
const DECA_PLUS: MotorPosition[] = [
  { motor: 1, angleDeg: 0.0, direction: "CCW" },
  { motor: 2, angleDeg: 37.38, direction: "CW" },
  { motor: 3, angleDeg: 72.83, direction: "CCW" },
  { motor: 4, angleDeg: 107.17, direction: "CW" },
  { motor: 5, angleDeg: 142.62, direction: "CCW" },
  { motor: 6, angleDeg: 180.0, direction: "CW" },
  { motor: 7, angleDeg: 217.38, direction: "CCW" },
  { motor: 8, angleDeg: 252.83, direction: "CW" },
  { motor: 9, angleDeg: 287.17, direction: "CCW" },
  { motor: 10, angleDeg: 322.62, direction: "CW" },
];

const DECA_X: MotorPosition[] = [
  { motor: 1, angleDeg: 17.17, direction: "CCW" },
  { motor: 2, angleDeg: 52.62, direction: "CW" },
  { motor: 3, angleDeg: 90.0, direction: "CCW" },
  { motor: 4, angleDeg: 127.38, direction: "CW" },
  { motor: 5, angleDeg: 162.83, direction: "CCW" },
  { motor: 6, angleDeg: 197.17, direction: "CW" },
  { motor: 7, angleDeg: 232.62, direction: "CCW" },
  { motor: 8, angleDeg: 270.0, direction: "CW" },
  { motor: 9, angleDeg: 307.38, direction: "CCW" },
  { motor: 10, angleDeg: 342.83, direction: "CW" },
];

// Keyed by `${FRAME_CLASS}_${FRAME_TYPE}` (real codes from ArduCopter's own apm.pdef.xml).
// Every combination here has a verified, real diagram behind it (see the module doc comment
// above for what's deliberately excluded and why) - anything not in this map falls back to a
// plain per-motor list instead of a possibly-wrong diagram (see frameDiagramMotors' null return).
const FRAME_DIAGRAMS: Record<string, MotorPosition[]> = {
  "1_0": QUAD_PLUS,
  "1_1": QUAD_X,
  "1_2": QUAD_V,
  "1_3": QUAD_H,
  "1_12": QUAD_X_BETAFLIGHT,
  "1_13": QUAD_X_DJI,
  "1_14": QUAD_X_CLOCKWISE,
  "1_18": QUAD_X_BETAFLIGHT_REV,
  "1_19": QUAD_Y4,
  "2_0": HEXA_PLUS,
  "2_1": HEXA_X,
  "2_3": HEXA_H,
  "2_13": HEXA_X_DJI,
  "2_14": HEXA_X_CLOCKWISE,
  "3_0": OCTA_PLUS,
  "3_1": OCTA_X,
  "3_2": OCTA_V,
  "3_3": OCTA_H,
  "3_13": OCTA_X_DJI,
  "3_14": OCTA_X_CLOCKWISE,
  "3_15": OCTA_I,
  "4_0": OCTAQUAD_PLUS,
  "4_1": OCTAQUAD_X,
  "4_2": OCTAQUAD_V,
  "4_3": OCTAQUAD_H,
  "4_12": OCTAQUAD_X_BETAFLIGHT,
  "4_14": OCTAQUAD_X_CLOCKWISE,
  "4_18": OCTAQUAD_X_BETAFLIGHT_REV,
  "5_0": Y6_A,
  "5_10": Y6_B,
  "5_11": Y6_F,
  "12_0": DODECAHEXA_PLUS,
  "12_1": DODECAHEXA_X,
  "14_0": DECA_PLUS,
  "14_1": DECA_X,
};

export function frameDiagramMotors(frameClass: number, frameType: number): MotorPosition[] | null {
  return FRAME_DIAGRAMS[`${frameClass}_${frameType}`] ?? null;
}

export interface FramePreset {
  key: string;
  frameClass: number;
  frameType: number;
  label: string;
}

// One entry per verified combination above - used by Dev Mode's frame-type selector (so a
// simulated vehicle can start as any of them, not just the Quad X default) and by tests.
export const VERIFIED_FRAME_PRESETS: FramePreset[] = [
  { key: "1_0", frameClass: 1, frameType: 0, label: "Quad Plus" },
  { key: "1_1", frameClass: 1, frameType: 1, label: "Quad X" },
  { key: "1_2", frameClass: 1, frameType: 2, label: "Quad V" },
  { key: "1_3", frameClass: 1, frameType: 3, label: "Quad H" },
  { key: "1_12", frameClass: 1, frameType: 12, label: "Quad X (BetaFlight)" },
  { key: "1_13", frameClass: 1, frameType: 13, label: "Quad X (DJI)" },
  { key: "1_14", frameClass: 1, frameType: 14, label: "Quad X (ClockwiseX)" },
  { key: "1_18", frameClass: 1, frameType: 18, label: "Quad X (BetaFlight Reversed)" },
  { key: "1_19", frameClass: 1, frameType: 19, label: "Quad Y4" },
  { key: "2_0", frameClass: 2, frameType: 0, label: "Hexa Plus" },
  { key: "2_1", frameClass: 2, frameType: 1, label: "Hexa X" },
  { key: "2_3", frameClass: 2, frameType: 3, label: "Hexa H" },
  { key: "2_13", frameClass: 2, frameType: 13, label: "Hexa X (DJI)" },
  { key: "2_14", frameClass: 2, frameType: 14, label: "Hexa X (ClockwiseX)" },
  { key: "3_0", frameClass: 3, frameType: 0, label: "Octa Plus" },
  { key: "3_1", frameClass: 3, frameType: 1, label: "Octa X" },
  { key: "3_2", frameClass: 3, frameType: 2, label: "Octa V" },
  { key: "3_3", frameClass: 3, frameType: 3, label: "Octa H" },
  { key: "3_13", frameClass: 3, frameType: 13, label: "Octa X (DJI)" },
  { key: "3_14", frameClass: 3, frameType: 14, label: "Octa X (ClockwiseX)" },
  { key: "3_15", frameClass: 3, frameType: 15, label: "Octa I" },
  { key: "4_0", frameClass: 4, frameType: 0, label: "OctaQuad Plus" },
  { key: "4_1", frameClass: 4, frameType: 1, label: "OctaQuad X" },
  { key: "4_2", frameClass: 4, frameType: 2, label: "OctaQuad V" },
  { key: "4_3", frameClass: 4, frameType: 3, label: "OctaQuad H" },
  { key: "4_12", frameClass: 4, frameType: 12, label: "OctaQuad X (BetaFlight)" },
  { key: "4_14", frameClass: 4, frameType: 14, label: "OctaQuad X (ClockwiseX)" },
  { key: "4_18", frameClass: 4, frameType: 18, label: "OctaQuad X (BetaFlight Reversed)" },
  { key: "5_0", frameClass: 5, frameType: 0, label: "Y6 A" },
  { key: "5_10", frameClass: 5, frameType: 10, label: "Y6 B" },
  { key: "5_11", frameClass: 5, frameType: 11, label: "Y6 F" },
  { key: "12_0", frameClass: 12, frameType: 0, label: "DodecaHexa Plus" },
  { key: "12_1", frameClass: 12, frameType: 1, label: "DodecaHexa X" },
  { key: "14_0", frameClass: 14, frameType: 0, label: "Deca Plus" },
  { key: "14_1", frameClass: 14, frameType: 1, label: "Deca X" },
];

// Total motor count per FRAME_CLASS - unlike exact position/rotation (verified only for the
// combinations above), a class's motor count is fixed by its name/definition regardless of
// frame type (Plus/X/V/...), so it's safe to use for the plain per-motor test list shown when
// no verified diagram exists. Codes from ArduCopter's own apm.pdef.xml.
const MOTOR_COUNT_BY_FRAME_CLASS: Record<number, number> = {
  1: 4, // Quad
  2: 6, // Hexa
  3: 8, // Octa
  4: 8, // OctaQuad
  5: 6, // Y6
  7: 3, // Tri
  8: 1, // SingleCopter
  9: 2, // CoaxCopter
  10: 2, // BiCopter
  12: 12, // DodecaHexa
  13: 4, // HeliQuad
  14: 10, // Deca
};

/** Total number of motor outputs for a FRAME_CLASS, or null if unknown (e.g. Heli's variable swash setups). */
export function motorCountForFrameClass(frameClass: number): number | null {
  return MOTOR_COUNT_BY_FRAME_CLASS[frameClass] ?? null;
}
