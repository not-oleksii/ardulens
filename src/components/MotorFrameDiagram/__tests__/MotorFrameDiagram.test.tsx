import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MotorPosition } from "../../../mavlink/frameDiagrams/frameDiagrams";
import { MotorFrameDiagram } from "../MotorFrameDiagram";

const QUAD_X: MotorPosition[] = [
  { motor: 1, angleDeg: 45, direction: "CCW" },
  { motor: 2, angleDeg: 225, direction: "CCW" },
  { motor: 3, angleDeg: 315, direction: "CW" },
  { motor: 4, angleDeg: 135, direction: "CW" },
];

// Y6 A - 3 arms, 2 coaxial (same-angle) motors per arm, 6 total.
const Y6_A: MotorPosition[] = [
  { motor: 1, angleDeg: 63.45, direction: "CCW" },
  { motor: 2, angleDeg: 296.55, direction: "CW" },
  { motor: 3, angleDeg: 296.55, direction: "CCW" },
  { motor: 4, angleDeg: 180.0, direction: "CW" },
  { motor: 5, angleDeg: 63.45, direction: "CW" },
  { motor: 6, angleDeg: 180.0, direction: "CCW" },
];

describe("MotorFrameDiagram", () => {
  it("renders one labeled group per motor, colored by rotation direction", () => {
    const { container } = render(
      <MotorFrameDiagram motors={QUAD_X} activeMotor={null} onTestStart={() => {}} onTestStop={() => {}} />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();

    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(4);
    const ccwCircles = Array.from(circles).filter((c) => c.getAttribute("fill") === "#00b8e6");
    const cwCircles = Array.from(circles).filter((c) => c.getAttribute("fill") === "#33cc33");
    expect(ccwCircles).toHaveLength(2); // motors 1, 2
    expect(cwCircles).toHaveLength(2); // motors 3, 4
  });

  it("calls onTestStart on pointerdown and onTestStop on pointerup for the pressed motor", () => {
    const onTestStart = vi.fn();
    const onTestStop = vi.fn();
    render(<MotorFrameDiagram motors={QUAD_X} activeMotor={null} onTestStart={onTestStart} onTestStop={onTestStop} />);

    const motor1Group = screen.getByText("1").closest("g")!;
    fireEvent.pointerDown(motor1Group);
    expect(onTestStart).toHaveBeenCalledWith(1);

    fireEvent.pointerUp(motor1Group);
    expect(onTestStop).toHaveBeenCalledWith(1);
  });

  it("stops the test on pointerleave too (e.g. the user drags off the motor while still holding)", () => {
    const onTestStop = vi.fn();
    render(<MotorFrameDiagram motors={QUAD_X} activeMotor={null} onTestStart={() => {}} onTestStop={onTestStop} />);

    const motor2Group = screen.getByText("2").closest("g")!;
    fireEvent.pointerLeave(motor2Group);
    expect(onTestStop).toHaveBeenCalledWith(2);
  });

  it("highlights the active motor with a larger radius", () => {
    render(<MotorFrameDiagram motors={QUAD_X} activeMotor={3} onTestStart={() => {}} onTestStop={() => {}} />);
    const motor3Group = screen.getByText("3").closest("g")!;
    const circle = motor3Group.querySelector("circle")!;
    expect(circle.getAttribute("r")).toBe("32"); // MOTOR_RADIUS(26) + 6 while active
  });

  it("renders all 6 motors of a coaxial frame (Y6), placing same-angle pairs at different distances from center", () => {
    const { container } = render(
      <MotorFrameDiagram motors={Y6_A} activeMotor={null} onTestStart={() => {}} onTestStop={() => {}} />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(container.querySelectorAll("circle")).toHaveLength(6);

    // Motors 1 and 5 share the same angle (63.45deg, one arm) - they must not render on top
    // of each other, so their translate() distance from center has to differ.
    const distanceFromCenter = (motor: number) => {
      const g = screen.getByText(String(motor)).closest("g")!;
      const transform = g.getAttribute("transform")!;
      const match = /translate\(([-\d.]+), ([-\d.]+)\)/.exec(transform)!;
      const x = Number(match[1]);
      const y = Number(match[2]);
      return Math.hypot(x, y);
    };
    expect(distanceFromCenter(1)).not.toBeCloseTo(distanceFromCenter(5));
  });
});
