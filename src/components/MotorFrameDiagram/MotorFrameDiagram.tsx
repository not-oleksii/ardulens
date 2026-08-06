import type { MotorPosition } from "../../mavlink/frameDiagrams/frameDiagrams";

interface MotorFrameDiagramProps {
  motors: MotorPosition[];
  /** The motor currently being pressed-and-held, or null if none. */
  activeMotor: number | null;
  onTestStart: (motor: number) => void;
  onTestStop: (motor: number) => void;
  size?: number;
}

const RADIUS = 100;
// Coaxial frames (Y6, OctoQuad, DodecaHexa) put two motors on the same arm/angle (one above
// the other in the real 3D layout) - rendered here as two circles at different radii along
// that same angle instead of overlapping at one point.
const COAXIAL_INNER_RADIUS = 62;
const COAXIAL_OUTER_RADIUS = 138;
// Exact colors from ArduPilot's own motor diagrams (m_01_01_quad_x.svg etc.) - CW is green,
// CCW is blue, matching what users already see in Mission Planner/the ArduPilot docs.
const CW_COLOR = "#33cc33";
const CCW_COLOR = "#00b8e6";
const MOTOR_RADIUS = 26;
const COAXIAL_MOTOR_RADIUS = 20;

function positionOf(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  // 0deg = front = up = negative y (matches the real diagrams' orientation), clockwise positive.
  return { x: radius * Math.sin(rad), y: -radius * Math.cos(rad) };
}

interface PlacedMotor extends MotorPosition {
  x: number;
  y: number;
  radius: number;
}

/** Groups motors sharing (nearly) the same angle - a coaxial pair - and assigns each an inner/
 *  outer radius instead of both landing on the exact same point. Single motors keep the
 *  original single-radius layout unchanged. */
function placeMotors(motors: MotorPosition[]): PlacedMotor[] {
  const groups = new Map<number, MotorPosition[]>();
  for (const m of motors) {
    const angleKey = Math.round(m.angleDeg * 10);
    const group = groups.get(angleKey);
    if (group) group.push(m);
    else groups.set(angleKey, [m]);
  }

  const placed: PlacedMotor[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      const m = group[0]!;
      placed.push({ ...m, ...positionOf(m.angleDeg, RADIUS), radius: MOTOR_RADIUS });
    } else {
      // Coaxial pair - lower motor number renders closer to center, matching no particular
      // physical convention (ArduPilot doesn't document a required "top/bottom" render order
      // here) but giving a stable, deterministic layout.
      const sorted = [...group].sort((a, b) => a.motor - b.motor);
      sorted.forEach((m, i) => {
        const radius = i === 0 ? COAXIAL_INNER_RADIUS : COAXIAL_OUTER_RADIUS;
        placed.push({ ...m, ...positionOf(m.angleDeg, radius), radius: COAXIAL_MOTOR_RADIUS });
      });
    }
  }
  return placed;
}

export function MotorFrameDiagram({ motors, activeMotor, onTestStart, onTestStop, size = 260 }: MotorFrameDiagramProps) {
  const placed = placeMotors(motors);
  const maxRadius = placed.some((m) => m.radius === COAXIAL_MOTOR_RADIUS) ? COAXIAL_OUTER_RADIUS : RADIUS;
  const viewBoxHalf = maxRadius + MOTOR_RADIUS + 10;

  return (
    <svg
      viewBox={`${-viewBoxHalf} ${-viewBoxHalf} ${viewBoxHalf * 2} ${viewBoxHalf * 2}`}
      width={size}
      height={size}
      role="img"
      aria-label="Motor layout"
    >
      {placed.map(({ motor, x, y }) => (
        <line key={motor} x1={0} y1={0} x2={x} y2={y} stroke="var(--border)" strokeWidth={6} />
      ))}
      {placed.map(({ motor, x, y, radius, direction }) => {
        const isActive = activeMotor === motor;
        return (
          <g
            key={motor}
            transform={`translate(${x}, ${y})`}
            className="cursor-pointer touch-none select-none"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId);
              onTestStart(motor);
            }}
            onPointerUp={() => onTestStop(motor)}
            onPointerLeave={() => onTestStop(motor)}
            onPointerCancel={() => onTestStop(motor)}
          >
            <circle
              r={isActive ? radius + 6 : radius}
              fill={direction === "CW" ? CW_COLOR : CCW_COLOR}
              stroke={isActive ? "var(--foreground)" : "none"}
              strokeWidth={3}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={radius === MOTOR_RADIUS ? 24 : 18}
              fontWeight="bold"
              fill="white"
            >
              {motor}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
