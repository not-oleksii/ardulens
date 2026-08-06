import { describe, expect, it } from "vitest";
import { frameDiagramMotors, motorCountForFrameClass, VERIFIED_FRAME_PRESETS } from "../frameDiagrams";

describe("frameDiagramMotors", () => {
  it("returns Quad X's 4 motors with the real ArduPilot layout (front-right CCW, rear-left CCW, front-left CW, rear-right CW)", () => {
    const motors = frameDiagramMotors(1, 1);
    expect(motors).toHaveLength(4);
    expect(motors).toEqual([
      { motor: 1, angleDeg: 45, direction: "CCW" },
      { motor: 2, angleDeg: 225, direction: "CCW" },
      { motor: 3, angleDeg: 315, direction: "CW" },
      { motor: 4, angleDeg: 135, direction: "CW" },
    ]);
  });

  it("returns Quad Plus's 4 motors (right/left/front/rear at 90/270/0/180 degrees)", () => {
    const motors = frameDiagramMotors(1, 0);
    expect(motors?.map((m) => m.angleDeg)).toEqual([90, 270, 0, 180]);
  });

  it("returns 6 motors for Hexa (Plus and X)", () => {
    expect(frameDiagramMotors(2, 0)).toHaveLength(6);
    expect(frameDiagramMotors(2, 1)).toHaveLength(6);
  });

  it("returns 8 motors for Octa (Plus and X)", () => {
    expect(frameDiagramMotors(3, 0)).toHaveLength(8);
    expect(frameDiagramMotors(3, 1)).toHaveLength(8);
  });

  it("every motor position has a unique angle within its own diagram (non-coaxial classes)", () => {
    for (const [frameClass, frameType] of [
      [1, 0],
      [1, 1],
      [2, 0],
      [2, 1],
      [3, 0],
      [3, 1],
      [14, 0], // Deca Plus - 10 independent arms, no coaxial pairs
      [14, 1], // Deca X
    ]) {
      const motors = frameDiagramMotors(frameClass!, frameType!)!;
      const angles = new Set(motors.map((m) => m.angleDeg));
      expect(angles.size).toBe(motors.length);
    }
  });

  it("returns null for a frame class/type combination that hasn't been verified (e.g. Tri, Heli)", () => {
    expect(frameDiagramMotors(7, 0)).toBeNull(); // Tri
    expect(frameDiagramMotors(6, 0)).toBeNull(); // Heli
    expect(frameDiagramMotors(0, 0)).toBeNull(); // Undefined
  });

  it("returns null for frame types where ArduPilot's own diagram doesn't define a rotation direction for every motor (V-Tail/A-Tail/Bicopter/Tricopter)", () => {
    expect(frameDiagramMotors(1, 4)).toBeNull(); // Quad V-Tail
    expect(frameDiagramMotors(1, 5)).toBeNull(); // Quad A-Tail
    expect(frameDiagramMotors(10, 0)).toBeNull(); // Bicopter
    expect(frameDiagramMotors(7, 0)).toBeNull(); // Tricopter (also asserted above)
  });

  it("supports OctaQuad's 8 coaxial motors (2 per arm, sharing an angle with opposite rotation)", () => {
    const motors = frameDiagramMotors(4, 1)!; // OctaQuad X
    expect(motors).toHaveLength(8);
    const motor1 = motors.find((m) => m.motor === 1)!;
    const motor6 = motors.find((m) => m.motor === 6)!;
    expect(motor1.angleDeg).toBe(motor6.angleDeg); // same arm
    expect(motor1.direction).not.toBe(motor6.direction); // counter-rotating pair
  });

  it("supports Y6's 6 coaxial motors (3 arms, 2 motors each)", () => {
    expect(frameDiagramMotors(5, 0)).toHaveLength(6); // Y6 A
    expect(frameDiagramMotors(5, 10)).toHaveLength(6); // Y6 B
    expect(frameDiagramMotors(5, 11)).toHaveLength(6); // Y6 F
  });

  it("supports DodecaHexa's 12 coaxial motors (6 arms, 2 motors each)", () => {
    expect(frameDiagramMotors(12, 0)).toHaveLength(12); // Plus
    expect(frameDiagramMotors(12, 1)).toHaveLength(12); // X
  });
});

describe("VERIFIED_FRAME_PRESETS", () => {
  it("has one entry per verified frameDiagramMotors combination, each resolvable", () => {
    expect(VERIFIED_FRAME_PRESETS.length).toBeGreaterThan(30);
    for (const preset of VERIFIED_FRAME_PRESETS) {
      expect(frameDiagramMotors(preset.frameClass, preset.frameType)).not.toBeNull();
    }
  });

  it("has no duplicate keys", () => {
    const keys = new Set(VERIFIED_FRAME_PRESETS.map((p) => p.key));
    expect(keys.size).toBe(VERIFIED_FRAME_PRESETS.length);
  });
});

describe("motorCountForFrameClass", () => {
  it("returns the real motor count for known frame classes regardless of frame type", () => {
    expect(motorCountForFrameClass(1)).toBe(4); // Quad
    expect(motorCountForFrameClass(2)).toBe(6); // Hexa
    expect(motorCountForFrameClass(3)).toBe(8); // Octa
    expect(motorCountForFrameClass(7)).toBe(3); // Tri
    expect(motorCountForFrameClass(14)).toBe(10); // Deca
  });

  it("returns null for a class with no fixed motor count (e.g. Heli, Undefined)", () => {
    expect(motorCountForFrameClass(6)).toBeNull(); // Heli
    expect(motorCountForFrameClass(0)).toBeNull(); // Undefined
  });
});
